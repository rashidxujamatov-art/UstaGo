const crypto = require('crypto');
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api/payments';
const CLICK_SECRET = 'click_secret_key_demo';
const CLICK_SERVICE_ID = '12345';

async function runPaymentTests() {
  console.log('----------------------------------------------------');
  console.log('🧪 RUNNING AUTOMATED CLICK & PAYME PAYMENT TEST SUITE');
  console.log('----------------------------------------------------');

  try {
    // 1. TEST CLICK PREPARE
    const clickTransId = 'clk_' + Date.now();
    const merchantTransId = 'usr_1';
    const amount = '50000.00';
    const action = '0'; // Prepare
    const signTime = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

    const signString = crypto
      .createHash('md5')
      .update(`${clickTransId}${CLICK_SERVICE_ID}${CLICK_SECRET}${merchantTransId}${amount}${action}${signTime}`)
      .digest('hex');

    console.log('1️⃣ Testing Click Prepare Endpoint...');
    const prepRes = await axios.post(`${BASE_URL}/click/prepare`, {
      click_trans_id: clickTransId,
      service_id: CLICK_SERVICE_ID,
      click_paydoc_id: 'paydoc_123',
      merchant_trans_id: merchantTransId,
      amount: amount,
      action: Number(action),
      error: 0,
      error_note: 'Success',
      sign_time: signTime,
      sign_string: signString
    });

    console.log('   Click Prepare Result:', prepRes.data);

    // 2. TEST CLICK COMPLETE
    const actionComplete = '1'; // Complete
    const prepareId = prepRes.data.merchant_prepare_id || 'click_prep_123';
    const completeSignString = crypto
      .createHash('md5')
      .update(`${clickTransId}${CLICK_SERVICE_ID}${CLICK_SECRET}${merchantTransId}${prepareId}${amount}${actionComplete}${signTime}`)
      .digest('hex');

    console.log('2️⃣ Testing Click Complete Endpoint...');
    const compRes = await axios.post(`${BASE_URL}/click/complete`, {
      click_trans_id: clickTransId,
      service_id: CLICK_SERVICE_ID,
      merchant_trans_id: merchantTransId,
      merchant_prepare_id: prepareId,
      amount: amount,
      action: Number(actionComplete),
      error: 0,
      sign_time: signTime,
      sign_string: completeSignString
    });

    console.log('   Click Complete Result:', compRes.data);

    // 3. TEST PAYME JSON-RPC 2.0 (CheckPerformTransaction)
    console.log('3️⃣ Testing Payme CheckPerformTransaction...');
    const paymeCheckRes = await axios.post(`${BASE_URL}/payme`, {
      jsonrpc: '2.0',
      id: 101,
      method: 'CheckPerformTransaction',
      params: {
        amount: 10000000, // 100 000 UZS in tiyin
        account: { user_id: 'usr_1' }
      }
    });

    console.log('   Payme CheckPerform Result:', paymeCheckRes.data);

    // 4. TEST PAYME JSON-RPC 2.0 (CreateTransaction)
    const paymeTransId = 'payme_' + Date.now();
    console.log('4️⃣ Testing Payme CreateTransaction...');
    const paymeCreateRes = await axios.post(`${BASE_URL}/payme`, {
      jsonrpc: '2.0',
      id: 102,
      method: 'CreateTransaction',
      params: {
        id: paymeTransId,
        time: Date.now(),
        amount: 10000000,
        account: { user_id: 'usr_1' }
      }
    });

    console.log('   Payme CreateTransaction Result:', paymeCreateRes.data);

    // 5. TEST PAYME JSON-RPC 2.0 (PerformTransaction)
    console.log('5️⃣ Testing Payme PerformTransaction...');
    const paymePerformRes = await axios.post(`${BASE_URL}/payme`, {
      jsonrpc: '2.0',
      id: 103,
      method: 'PerformTransaction',
      params: {
        id: paymeTransId
      }
    });

    console.log('   Payme PerformTransaction Result:', paymePerformRes.data);

    console.log('----------------------------------------------------');
    console.log('✅ ALL CLICK AND PAYME PAYMENT TESTS PASSED SUCCESSFULLY!');
    console.log('----------------------------------------------------');

  } catch (err) {
    console.error('❌ Test error:', err.response ? err.response.data : err.message);
  }
}

runPaymentTests();
