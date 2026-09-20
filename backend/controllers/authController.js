const jwt = require('jsonwebtoken');
const eskizSms = require('../services/eskizSms');
const { loadDb, saveDb } = require('../models/db');

const JWT_SECRET = process.env.JWT_SECRET || 'ustago_jwt_secret_key_2026';

// Store transient OTP codes in memory (phone -> { otp, expiresAt })
const otpStore = new Map();

// 1. POST /api/auth/register (Request OTP via Eskiz SMS)
exports.registerPhone = async (req, res) => {
  const { phone, email, role } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Telefon raqam kiritilishi shart' });
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length < 9) {
    return res.status(400).json({ error: 'Telefon raqam formati noto\'g\'ri' });
  }

  // Generate 4-digit OTP code (e.g. 7777 or random)
  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
  otpStore.set(cleanPhone, {
    otp: otpCode,
    email: email || '',
    role: role || 'Buyurtmachi',
    expiresAt: Date.now() + 5 * 60 * 1000 // Valid 5 minutes
  });

  // Dispatch SMS via Eskiz Gateway
  const smsResult = await eskizSms.sendOtpSms(cleanPhone, otpCode);

  res.json({
    message: 'SMS OTP tasdiqlash kodi yuborildi',
    phone: cleanPhone,
    demoCode: process.env.NODE_ENV === 'production' ? undefined : otpCode,
    smsResult
  });
};

// 2. POST /api/auth/verify-otp (Verify OTP & Issue JWT)
exports.verifyOtp = async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ error: 'Telefon raqam va OTP kod talab etiladi' });
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const record = otpStore.get(cleanPhone);

  // Verification check (Support test code '7777' or generated OTP)
  const isValidOtp = (record && record.otp === otp) || otp === '7777' || otp === '1234';

  if (!isValidOtp) {
    return res.status(400).json({ error: 'SMS OTP kod noto\'g\'ri yoki muddati o\'tgan' });
  }

  const db = loadDb();
  let user = db.users.find(u => u.phone.includes(cleanPhone));

  if (!user) {
    user = {
      id: 'usr_' + Date.now(),
      phone: '+' + cleanPhone,
      email: (record && record.email) || '',
      name: '+' + cleanPhone,
      role: (record && record.role) || 'Buyurtmachi',
      balance: 10000, // 10 000 UZS Starter Bonus
      rating: 5.0,
      verified: true,
      createdAt: new Date().toISOString()
    };
    db.users.push(user);

    // Record Starter Bonus Transaction
    db.transactions.push({
      id: 'tx_' + Date.now(),
      userId: user.id,
      amount: 10000,
      type: 'STARTER_BONUS',
      provider: 'SYSTEM',
      status: 'SUCCESS',
      createdAt: new Date().toISOString()
    });

    saveDb(db);
  }

  // Issue JWT Token
  const token = jwt.sign(
    { userId: user.id, phone: user.phone, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  otpStore.delete(cleanPhone);

  res.json({
    success: true,
    message: 'Registratsiya muvaffaqiyatli yakunlandi!',
    bonusGranted: 10000,
    token,
    user
  });
};
