const express = require('express');
const router = express.Router();
const clickMerchant = require('../services/clickMerchant');
const paymeMerchant = require('../services/paymeMerchant');

// Click Merchant Webhooks
router.post('/click/prepare', clickMerchant.handlePrepare);
router.post('/click/complete', clickMerchant.handleComplete);

// Payme JSON-RPC 2.0 Webhook
router.post('/payme', paymeMerchant.handleJsonRpc);

module.exports = router;
