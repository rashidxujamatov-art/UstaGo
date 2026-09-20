const crypto = require('crypto');
const { loadDb, saveDb } = require('../models/db');

const CLICK_SECRET_KEY = process.env.CLICK_SECRET_KEY || 'click_secret_key_demo';
const CLICK_SERVICE_ID = process.env.CLICK_SERVICE_ID || '12345';

// 1. Prepare Action (action = 0)
exports.handlePrepare = (req, res) => {
  const {
    click_trans_id,
    service_id,
    click_paydoc_id,
    merchant_trans_id,
    amount,
    action,
    error,
    error_note,
    sign_time,
    sign_string
  } = req.body;

  // Validate Sign String
  const expectedSign = crypto
    .createHash('md5')
    .update(`${click_trans_id}${service_id}${CLICK_SECRET_KEY}${merchant_trans_id}${amount}${action}${sign_time}`)
    .digest('hex');

  if (sign_string && sign_string !== expectedSign && process.env.NODE_ENV === 'production') {
    return res.json({ error: -1, error_note: 'SIGN CHECK FAILED' });
  }

  const db = loadDb();
  const user = db.users.find(u => u.id === merchant_trans_id || u.phone.includes(merchant_trans_id)) || db.users[0];

  if (!user) {
    return res.json({ error: -5, error_note: 'USER NOT FOUND' });
  }

  const prepareId = 'click_prep_' + Date.now();
  db.clickTransactions.push({
    clickTransId: click_trans_id,
    merchantTransId: user.id,
    amount: Number(amount),
    status: 'PREPARED',
    signTime: sign_time,
    createdAt: new Date().toISOString()
  });
  saveDb(db);

  res.json({
    error: 0,
    error_note: 'Success',
    click_trans_id,
    merchant_trans_id: user.id,
    merchant_prepare_id: prepareId
  });
};

// 2. Complete Action (action = 1)
exports.handleComplete = (req, res) => {
  const {
    click_trans_id,
    service_id,
    merchant_trans_id,
    merchant_prepare_id,
    amount,
    action,
    error,
    sign_time,
    sign_string
  } = req.body;

  // Validate Sign String
  const expectedSign = crypto
    .createHash('md5')
    .update(`${click_trans_id}${service_id}${CLICK_SECRET_KEY}${merchant_trans_id}${merchant_prepare_id || ''}${amount}${action}${sign_time}`)
    .digest('hex');

  if (sign_string && sign_string !== expectedSign && process.env.NODE_ENV === 'production') {
    return res.json({ error: -1, error_note: 'SIGN CHECK FAILED' });
  }

  const db = loadDb();
  const user = db.users.find(u => u.id === merchant_trans_id || u.phone.includes(merchant_trans_id)) || db.users[0];

  if (!user) {
    return res.json({ error: -5, error_note: 'USER NOT FOUND' });
  }

  // Credit Balance
  const addAmount = Number(amount);
  user.balance = (user.balance || 0) + addAmount;

  // Record Transaction
  db.transactions.push({
    id: 'tx_click_' + Date.now(),
    userId: user.id,
    amount: addAmount,
    type: 'TOPUP',
    provider: 'CLICK',
    status: 'SUCCESS',
    clickTransId: click_trans_id,
    createdAt: new Date().toISOString()
  });

  saveDb(db);

  res.json({
    error: 0,
    error_note: 'Success',
    click_trans_id,
    merchant_trans_id: user.id,
    merchant_confirm_id: 'click_conf_' + Date.now()
  });
};
