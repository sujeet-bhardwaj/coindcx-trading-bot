const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

router.get('/orders', orderController.getOrders);
router.get('/trades', orderController.getTrades);

module.exports = router;
