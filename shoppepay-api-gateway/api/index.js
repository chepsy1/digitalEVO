require('dotenv').config();

const axios = require('axios');
const app = require('../server');

app.get('/api/telegram-test', async (req, res) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token) {
      return res.status(500).json({
        success: false,
        error: 'TELEGRAM_BOT_TOKEN belum diset'
      });
    }

    if (!chatId) {
      return res.status(500).json({
        success: false,
        error: 'TELEGRAM_CHAT_ID belum diset'
      });
    }

    const response = await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: '✅ TEST TELEGRAM digitalEVO berhasil dari Vercel!'
      }
    );

    res.json({
      success: true,
      message: 'Telegram berhasil dikirim'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

module.exports = app;
