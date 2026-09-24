const {
  OrderStates,
  OrderStateMachine,
} = require('../src/trading/orderStateMachine');

describe('Order State Machine & Anti-Duplicate Execution (Rules #39, #40, #42, #54)', () => {
  let sm;

  beforeEach(() => {
    sm = new OrderStateMachine(OrderStates.NO_POSITION);
  });

  describe('Normal Lifecycle Transitions', () => {
    it('should complete standard Long trade lifecycle smoothly', () => {
      expect(sm.getState()).toBe(OrderStates.NO_POSITION);
      expect(sm.canBuy()).toBe(true);
      expect(sm.canSell()).toBe(false);

      // 1. Submit BUY order -> BUY_PENDING
      sm.transitionTo(OrderStates.BUY_PENDING, 'Signal generated and pre-checks passed');
      expect(sm.getState()).toBe(OrderStates.BUY_PENDING);
      expect(sm.canBuy()).toBe(false);

      // 2. Exchange fills order -> LONG_OPEN
      sm.transitionTo(OrderStates.LONG_OPEN, 'Order filled on exchange');
      expect(sm.getState()).toBe(OrderStates.LONG_OPEN);
      expect(sm.canBuy()).toBe(false);
      expect(sm.canSell()).toBe(true);

      // 3. Profit-Lock triggered -> SELL_PENDING
      sm.transitionTo(OrderStates.SELL_PENDING, 'Dynamic profit-lock triggered exit');
      expect(sm.getState()).toBe(OrderStates.SELL_PENDING);
      expect(sm.canBuy()).toBe(false);
      expect(sm.canSell()).toBe(false);

      // 4. Sell filled -> CLOSED
      sm.transitionTo(OrderStates.CLOSED, 'Sell order completed');
      expect(sm.getState()).toBe(OrderStates.CLOSED);

      // 5. Clean state reset -> NO_POSITION
      sm.transitionTo(OrderStates.NO_POSITION, 'Position cleaned up');
      expect(sm.getState()).toBe(OrderStates.NO_POSITION);
      expect(sm.canBuy()).toBe(true);
    });
  });

  describe('Anti-Duplicate Protection (Rules #40 & #42)', () => {
    it('should BLOCK duplicate BUY when position is already open (LONG_OPEN)', () => {
      sm.transitionTo(OrderStates.BUY_PENDING);
      sm.transitionTo(OrderStates.LONG_OPEN);

      // Attempting to buy again while LONG_OPEN must throw ILLEGAL_STATE_TRANSITION
      expect(() => {
        sm.transitionTo(OrderStates.BUY_PENDING, 'Scheduler triggered another BUY');
      }).toThrow(/ILLEGAL_STATE_TRANSITION/);

      expect(sm.getState()).toBe(OrderStates.LONG_OPEN);
      expect(sm.canBuy()).toBe(false);
    });

    it('should BLOCK duplicate BUY when previous BUY is still pending (BUY_PENDING)', () => {
      sm.transitionTo(OrderStates.BUY_PENDING);

      expect(() => {
        sm.transitionTo(OrderStates.BUY_PENDING, 'Repeated API tick');
      }).toThrow(/ILLEGAL_STATE_TRANSITION/);

      expect(sm.getState()).toBe(OrderStates.BUY_PENDING);
    });

    it('should BLOCK duplicate SELL when SELL is already pending (SELL_PENDING)', () => {
      sm.transitionTo(OrderStates.BUY_PENDING);
      sm.transitionTo(OrderStates.LONG_OPEN);
      sm.transitionTo(OrderStates.SELL_PENDING);

      // Attempting to sell again while already SELL_PENDING must throw error
      expect(() => {
        sm.transitionTo(OrderStates.SELL_PENDING, 'Duplicate sell tick');
      }).toThrow(/ILLEGAL_STATE_TRANSITION/);

      expect(sm.getState()).toBe(OrderStates.SELL_PENDING);
    });
  });

  describe('Order Execution Timeout (Rule #39)', () => {
    it('should detect order timeout when order is pending longer than threshold', () => {
      const timeoutMs = 10000;
      const testSm = new OrderStateMachine(OrderStates.NO_POSITION, { orderTimeoutMs: timeoutMs });
      testSm.generateClientOrderId('buy', 'BTCUSDT');
      testSm.transitionTo(OrderStates.BUY_PENDING);

      const startTime = testSm.pendingOrderStartTime;

      // 5 seconds later -> Not timed out
      expect(testSm.checkOrderTimeout(startTime + 5000).isTimedOut).toBe(false);

      // 12 seconds later -> Timed out!
      const timeoutCheck = testSm.checkOrderTimeout(startTime + 12000);
      expect(timeoutCheck.isTimedOut).toBe(true);
      expect(timeoutCheck.elapsedMs).toBe(12000);
      expect(timeoutCheck.activeClientOrderId).toContain('CDX_BUY_BTCUSDT');
    });
  });

  describe('Restart Recovery & Reconciliation (Rule #54)', () => {
    it('should restore state to LONG_OPEN if active position was recovered from database', () => {
      const restoredState = sm.reconcile(1, false);
      expect(restoredState).toBe(OrderStates.LONG_OPEN);
      expect(sm.getState()).toBe(OrderStates.LONG_OPEN);
      expect(sm.canBuy()).toBe(false);
      expect(sm.canSell()).toBe(true);
    });

    it('should restore state to NO_POSITION if no positions exist on startup', () => {
      const restoredState = sm.reconcile(0, false);
      expect(restoredState).toBe(OrderStates.NO_POSITION);
      expect(sm.canBuy()).toBe(true);
    });

    it('should restore state to PAUSED if safety limits were paused before restart', () => {
      const restoredState = sm.reconcile(0, true);
      expect(restoredState).toBe(OrderStates.PAUSED);
      expect(sm.canBuy()).toBe(false);
    });
  });
});
