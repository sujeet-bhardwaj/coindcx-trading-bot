const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const authMiddleware = require('../middleware/authMiddleware');

// Public read endpoints (used by frontend dashboard)
router.get('/status', botController.getStatus);
router.get('/settings', botController.getSettings);
router.get('/health', botController.getHealthDashboard);
router.get('/daily-summary', botController.getDailySummary);

// Authenticated bot control & mutation endpoints (Rule #93)
router.post('/start', authMiddleware, botController.startBot);
router.post('/stop', authMiddleware, botController.stopBot);
router.post('/emergency-stop', authMiddleware, botController.emergencyStop);
router.post('/reset-emergency-stop', authMiddleware, botController.resetEmergencyStop);
router.post('/pause-entries', authMiddleware, botController.pauseEntries);
router.post('/resume-entries', authMiddleware, botController.resumeEntries);
router.post('/reset-daily-pause', authMiddleware, botController.resetDailyPause);
router.post('/reset-consecutive-loss-pause', authMiddleware, botController.resetConsecutiveLossPause);
router.patch('/settings', authMiddleware, botController.updateSettings);
router.post('/mode', authMiddleware, botController.switchMode);
router.post('/simulate-trade', authMiddleware, botController.simulateTrade);
router.post('/backtest', authMiddleware, botController.runBacktest);

module.exports = router;
