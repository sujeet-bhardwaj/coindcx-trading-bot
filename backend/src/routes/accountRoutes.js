const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');

router.get('/balance', accountController.getBalance);

module.exports = router;
