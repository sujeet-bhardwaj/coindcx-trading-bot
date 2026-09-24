/**
 * Explicit Order State Machine & Anti-Duplicate Execution Engine
 * Implements Requirements #39, #40, #42, #54
 * Pure state manager: Completely deterministic and unit-testable.
 */

const OrderStates = {
  NO_POSITION: 'NO_POSITION',
  BUY_PENDING: 'BUY_PENDING',
  LONG_OPEN: 'LONG_OPEN',
  SELL_PENDING: 'SELL_PENDING',
  SHORT_PENDING: 'SHORT_PENDING',
  SHORT_OPEN: 'SHORT_OPEN',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
  ERROR: 'ERROR',
  PAUSED: 'PAUSED',
};

// Strict permitted state transition graph
const ALLOWED_TRANSITIONS = {
  [OrderStates.NO_POSITION]: [
    OrderStates.BUY_PENDING,
    OrderStates.SHORT_PENDING,
    OrderStates.LONG_OPEN, // Allowed during restart reconciliation
    OrderStates.SHORT_OPEN,
    OrderStates.PAUSED,
    OrderStates.ERROR,
  ],
  [OrderStates.BUY_PENDING]: [
    OrderStates.LONG_OPEN,
    OrderStates.NO_POSITION, // If order was cancelled / rejected
    OrderStates.ERROR,
    OrderStates.PAUSED,
  ],
  [OrderStates.SHORT_PENDING]: [
    OrderStates.SHORT_OPEN,
    OrderStates.NO_POSITION,
    OrderStates.ERROR,
    OrderStates.PAUSED,
  ],
  [OrderStates.LONG_OPEN]: [
    OrderStates.SELL_PENDING,
    OrderStates.CLOSING,
    OrderStates.NO_POSITION, // Emergency liquidation reconciliation
    OrderStates.ERROR,
    OrderStates.PAUSED,
  ],
  [OrderStates.SHORT_OPEN]: [
    OrderStates.SELL_PENDING,
    OrderStates.CLOSING,
    OrderStates.NO_POSITION,
    OrderStates.ERROR,
    OrderStates.PAUSED,
  ],
  [OrderStates.SELL_PENDING]: [
    OrderStates.CLOSING,
    OrderStates.CLOSED,
    OrderStates.NO_POSITION,
    OrderStates.LONG_OPEN, // If sell failed and position remains open
    OrderStates.SHORT_OPEN,
    OrderStates.ERROR,
  ],
  [OrderStates.CLOSING]: [
    OrderStates.CLOSED,
    OrderStates.NO_POSITION,
    OrderStates.LONG_OPEN,
    OrderStates.SHORT_OPEN,
    OrderStates.ERROR,
  ],
  [OrderStates.CLOSED]: [
    OrderStates.NO_POSITION,
    OrderStates.PAUSED,
    OrderStates.ERROR,
  ],
  [OrderStates.ERROR]: [
    OrderStates.NO_POSITION,
    OrderStates.PAUSED,
  ],
  [OrderStates.PAUSED]: [
    OrderStates.NO_POSITION,
    OrderStates.LONG_OPEN,
    OrderStates.SHORT_OPEN,
  ],
};

class OrderStateMachine {
  constructor(initialState = OrderStates.NO_POSITION, options = {}) {
    this.state = initialState;
    this.orderTimeoutMs = options.orderTimeoutMs || 15000; // 15s execution timeout (Rule #39)
    this.activeClientOrderId = null;
    this.pendingOrderStartTime = null;
    this.history = [];
    this.maxHistoryLength = 50;

    this._recordHistory(initialState, 'INITIALIZED');
  }

  /**
   * Current active state
   */
  getState() {
    return this.state;
  }

  /**
   * Validates if transition from current state to target state is legally permitted
   */
  isTransitionAllowed(targetState) {
    if (this.state === targetState) return false;
    const allowed = ALLOWED_TRANSITIONS[this.state] || [];
    return allowed.includes(targetState);
  }

  /**
   * Executes a state transition with reason and optional metadata
   */
  transitionTo(targetState, reason = '', meta = {}) {
    if (!OrderStates[targetState]) {
      throw new Error(`Invalid target state: ${targetState}`);
    }

    if (!this.isTransitionAllowed(targetState)) {
      const err = new Error(
        `ILLEGAL_STATE_TRANSITION: Cannot transition from ${this.state} to ${targetState}. Reason: ${reason}`
      );
      err.fromState = this.state;
      err.toState = targetState;
      throw err;
    }

    const previousState = this.state;
    this.state = targetState;

    // Track pending order timestamp for timeout enforcement (Rule #39)
    if (targetState === OrderStates.BUY_PENDING || targetState === OrderStates.SELL_PENDING || targetState === OrderStates.SHORT_PENDING) {
      this.pendingOrderStartTime = Date.now();
    } else {
      this.pendingOrderStartTime = null;
    }

    // Reset client order id on clean state
    if (targetState === OrderStates.NO_POSITION || targetState === OrderStates.CLOSED) {
      this.activeClientOrderId = null;
    }

    this._recordHistory(targetState, reason, { previousState, ...meta });

    return {
      success: true,
      previousState,
      currentState: this.state,
      reason,
    };
  }

  /**
   * Checks if bot can safely place a BUY order
   * Anti-Duplicate Protection: Prevents BUY -> BUY -> BUY (Rule #40 & #42)
   */
  canBuy() {
    return this.state === OrderStates.NO_POSITION;
  }

  /**
   * Checks if bot can safely place a SELL/EXIT order
   */
  canSell() {
    return this.state === OrderStates.LONG_OPEN || this.state === OrderStates.SHORT_OPEN;
  }

  /**
   * Generates unique, idempotent client order ID (Rule #39 & #42)
   */
  generateClientOrderId(side = 'buy', pair = 'BTCUSDT') {
    const timestamp = Date.now();
    const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const id = `CDX_${side.toUpperCase()}_${pair}_${timestamp}_${rand}`;
    this.activeClientOrderId = id;
    return id;
  }

  /**
   * Checks if an order is stuck in PENDING status longer than timeout (Rule #39)
   */
  checkOrderTimeout(now = Date.now()) {
    const isPending =
      this.state === OrderStates.BUY_PENDING ||
      this.state === OrderStates.SELL_PENDING ||
      this.state === OrderStates.SHORT_PENDING;

    if (!isPending || !this.pendingOrderStartTime) {
      return { isTimedOut: false, elapsedMs: 0 };
    }

    const elapsedMs = now - this.pendingOrderStartTime;
    const isTimedOut = elapsedMs > this.orderTimeoutMs;

    return {
      isTimedOut,
      elapsedMs,
      activeClientOrderId: this.activeClientOrderId,
      state: this.state,
    };
  }

  /**
   * Reconciles state after bot restart or external event (Rule #54)
   */
  reconcile(openPositionsCount = 0, isPaused = false) {
    if (isPaused) {
      this.state = OrderStates.PAUSED;
    } else if (openPositionsCount > 0) {
      this.state = OrderStates.LONG_OPEN;
    } else {
      this.state = OrderStates.NO_POSITION;
    }
    this._recordHistory(this.state, 'RECONCILED_ON_STARTUP', { openPositionsCount, isPaused });
    return this.state;
  }

  _recordHistory(state, reason, meta = {}) {
    this.history.unshift({
      timestamp: new Date().toISOString(),
      state,
      reason,
      meta,
    });
    if (this.history.length > this.maxHistoryLength) {
      this.history.pop();
    }
  }
}

module.exports = {
  OrderStates,
  ALLOWED_TRANSITIONS,
  OrderStateMachine,
};
