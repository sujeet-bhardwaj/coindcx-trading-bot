const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');

router.get('/status', botController.getStatus);
router.post('/start', botController.startBot);
router.post('/stop', botController.stopBot);
router.post('/emergency-stop', botController.emergencyStop);
router.post('/reset-emergency-stop', botController.resetEmergencyStop);
router.get('/settings', botController.getSettings);
router.patch('/settings', botController.updateSettings);

module.exports = router;
