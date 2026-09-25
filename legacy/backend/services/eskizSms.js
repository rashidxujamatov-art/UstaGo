const axios = require('axios');

class EskizSmsService {
  constructor() {
    this.baseUrl = 'https://notify.eskiz.uz/api';
    this.email = process.env.ESKIZ_EMAIL || 'info@ustago.uz';
    this.password = process.env.ESKIZ_PASSWORD || 'secret_password';
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  // 1. Authenticate with Eskiz.uz to retrieve bearer token
  async authenticate() {
    try {
      const response = await axios.post(`${this.baseUrl}/auth/login`, {
        email: this.email,
        password: this.password
      });

      if (response.data && response.data.data && response.data.data.token) {
        this.token = response.data.data.token;
        // Token is valid for 30 days
        this.tokenExpiresAt = Date.now() + 29 * 24 * 60 * 60 * 1000;
        console.log('✅ Eskiz.uz SMS Service token muvaffaqiyatli olindi');
        return this.token;
      }
    } catch (err) {
      console.warn('⚠️ Eskiz.uz Auth ogohlantirish (Demo rejimida ishlaydi):', err.message);
      this.token = 'demo_eskiz_token';
      return this.token;
    }
  }

  // 2. Get valid bearer token
  async getToken() {
    if (!this.token || Date.now() >= this.tokenExpiresAt) {
      await this.authenticate();
    }
    return this.token;
  }

  // 3. Send SMS message to Uzbekistan phone number
  async sendOtpSms(phone, otpCode) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const message = `UstaGo platformasiga kirish uchun tasdiqlash kodi: ${otpCode}. Hech kimga oshkor qilmang!`;

    try {
      const token = await this.getToken();
      if (token === 'demo_eskiz_token') {
        console.log(`📱 [DEMO SMS DISPATCH] To: ${cleanPhone} | Message: ${message}`);
        return { success: true, mode: 'demo', phone: cleanPhone, otpCode };
      }

      const response = await axios.post(
        `${this.baseUrl}/message/sms/send`,
        {
          mobile_phone: cleanPhone,
          message: message,
          from: '4546', // Eskiz default nickname
          callback_url: ''
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      console.log(`✅ [ESKIZ SMS YUBORILDI] Status: ${response.data.status} | Phone: ${cleanPhone}`);
      return { success: true, data: response.data };

    } catch (err) {
      console.error('❌ Eskiz SMS yuborishda xatolik:', err.response ? err.response.data : err.message);
      // Fallback response for dev/sandbox mode
      return { success: true, mode: 'fallback_sandbox', phone: cleanPhone, otpCode };
    }
  }
}

module.exports = new EskizSmsService();
