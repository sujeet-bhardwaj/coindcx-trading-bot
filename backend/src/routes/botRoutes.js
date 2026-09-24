const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const authMiddleware = require('../middleware/authMiddleware');

// Public read endpoints (used by frontend dashboard)
router.get('/status', botController.getStatus);
router.get('/settings', botController.getSettings);

// Authenticated bot control & mutation endpoints
router.post('/start', authMiddleware, botController.startBot);
router.post('/stop', authMiddleware, botController.stopBot);
router.post('/emergency-stop', authMiddleware, botController.emergencyStop);
router.post('/reset-emergency-stop', authMiddleware, botController.resetEmergencyStop);
router.patch('/settings', authMiddleware, botController.updateSettings);
router.post('/simulate-trade', authMiddleware, botController.simulateTrade);
router.post('/backtest', authMiddleware, botController.runBacktest);

module.exports = router;
