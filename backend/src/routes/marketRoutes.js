const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');

router.get('/pairs', marketController.getSupportedPairs);
router.get('/ticker/:pair', marketController.getTicker);
router.get('/details/:pair', marketController.getMarketDetails);
router.get('/candles/:pair', marketController.getCandles);
router.get('/orderbook/:pair', marketController.getOrderBook);

module.exports = router;
