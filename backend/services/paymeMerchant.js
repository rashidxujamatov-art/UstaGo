const { loadDb, saveDb } = require('../models/db');

// Error Codes according to Payme JSON-RPC 2.0 Spec
const PAYME_ERRORS = {
  INVALID_AMOUNT: { code: -31001, message: { uz: 'Notogri summa', ru: 'Неверная сумма', en: 'Invalid amount' } },
  USER_NOT_FOUND: { code: -31050, message: { uz: 'Foydalanuvchi topilmadi', ru: 'Пользователь не найден', en: 'User not found' } },
  TRANSACTION_NOT_FOUND: { code: -31003, message: { uz: 'Tranzaksiya topilmadi', ru: 'Транзакция не найдена', en: 'Transaction not found' } },
  CANT_CANCEL: { code: -31007, message: { uz: 'Tranzaksiyani bekor qilib bolmaydi', ru: 'Невозможно отменить транзакцию', en: 'Can not cancel' } }
};

exports.handleJsonRpc = (req, res) => {
  const { method, params, id } = req.body;
  const db = loadDb();

  switch (method) {
    case 'CheckPerformTransaction': {
      const { amount, account } = params;
      const userId = account ? account.user_id : null;
      const user = db.users.find(u => u.id === userId || u.phone.includes(userId)) || db.users[0];

      if (!user) {
        return res.json({ id, error: PAYME_ERRORS.USER_NOT_FOUND });
      }
      if (!amount || amount < 100000) { // Minimum 1000 UZS (100000 tiyin)
        return res.json({ id, error: PAYME_ERRORS.INVALID_AMOUNT });
      }
      return res.json({ id, result: { allow: true } });
    }

    case 'CreateTransaction': {
      const { id: paymeId, time, amount, account } = params;
      const userId = account ? account.user_id : null;
      const user = db.users.find(u => u.id === userId || u.phone.includes(userId)) || db.users[0];

      let tx = db.paymeTransactions.find(t => t.paymeId === paymeId);
      if (tx) {
        return res.json({
          id,
          result: {
            create_time: tx.createTime,
            transaction: tx.id,
            state: tx.state
          }
        });
      }

      const newTx = {
        id: 'payme_tx_' + Date.now(),
        paymeId,
        createTime: time,
        performTime: 0,
        cancelTime: 0,
        amount, // In tiyin
        userId: user ? user.id : 'usr_1',
        state: 1, // 1: Created
        reason: null
      };

      db.paymeTransactions.push(newTx);
      saveDb(db);

      return res.json({
        id,
        result: {
          create_time: newTx.createTime,
          transaction: newTx.id,
          state: newTx.state
        }
      });
    }

    case 'PerformTransaction': {
      const { id: paymeId } = params;
      let tx = db.paymeTransactions.find(t => t.paymeId === paymeId);

      if (!tx) {
        return res.json({ id, error: PAYME_ERRORS.TRANSACTION_NOT_FOUND });
      }

      if (tx.state === 1) {
        tx.state = 2; // 2: Performed
        tx.performTime = Date.now();

        // Credit Balance (Payme amount is in tiyin -> divide by 100)
        const creditSum = tx.amount / 100;
        const user = db.users.find(u => u.id === tx.userId) || db.users[0];
        if (user) {
          user.balance = (user.balance || 0) + creditSum;
        }

        db.transactions.push({
          id: 'tx_payme_' + Date.now(),
          userId: tx.userId,
          amount: creditSum,
          type: 'TOPUP',
          provider: 'PAYME',
          status: 'SUCCESS',
          paymeTransId: paymeId,
          createdAt: new Date().toISOString()
        });

        saveDb(db);
      }

      return res.json({
        id,
        result: {
          transaction: tx.id,
          perform_time: tx.performTime,
          state: tx.state
        }
      });
    }

    case 'CancelTransaction': {
      const { id: paymeId, reason } = params;
      let tx = db.paymeTransactions.find(t => t.paymeId === paymeId);

      if (!tx) {
        return res.json({ id, error: PAYME_ERRORS.TRANSACTION_NOT_FOUND });
      }

      if (tx.state === 1) {
        tx.state = -1; // Cancelled before perform
        tx.cancelTime = Date.now();
        tx.reason = reason;
      } else if (tx.state === 2) {
        tx.state = -2; // Cancelled after perform
        tx.cancelTime = Date.now();
        tx.reason = reason;
      }

      saveDb(db);

      return res.json({
        id,
        result: {
          transaction: tx.id,
          cancel_time: tx.cancelTime,
          state: tx.state
        }
      });
    }

    case 'CheckTransaction': {
      const { id: paymeId } = params;
      let tx = db.paymeTransactions.find(t => t.paymeId === paymeId);

      if (!tx) {
        return res.json({ id, error: PAYME_ERRORS.TRANSACTION_NOT_FOUND });
      }

      return res.json({
        id,
        result: {
          create_time: tx.createTime,
          perform_time: tx.performTime,
          cancel_time: tx.cancelTime,
          transaction: tx.id,
          state: tx.state,
          reason: tx.reason
        }
      });
    }

    default:
      return res.json({ id, error: { code: -32601, message: 'Method not found' } });
  }
};
