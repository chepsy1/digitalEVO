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


app.use(require('express').json());

app.post('/api/order', async (req, res) => {
  try {
    const { service, quantity, username, total, payment } = req.body;

    const message = `🛒 ORDER BARU DIGITAL EVO

📦 Layanan: ${service || '-'}
🔢 Jumlah: ${quantity || '-'}
👤 Username: ${username || '-'}
💰 Total: ${total || '-'}
💳 Pembayaran: ${payment || 'QRIS'}

⏳ Status: Menunggu Pembayaran`;

    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message
      }
    );

    res.json({ success: true, message: 'Order berhasil dikirim ke Telegram' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});


app.post('/notify-order', async (req, res) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return res.status(500).json({
        success: false,
        error: 'Telegram belum dikonfigurasi'
      });
    }

    const order = req.body || {};

    const paymentTime = order.paymentTime
      ? new Date(order.paymentTime).toLocaleString('id-ID', {
          timeZone: 'Asia/Makassar'
        })
      : new Date().toLocaleString('id-ID', {
          timeZone: 'Asia/Makassar'
        });

    const category = order.category || '-';
    const quantity = order.qty || order.quantity || '-';
    const username =
      order.shopeeLink ||
      order.username ||
      order.accountName ||
      '-';

    const whatsapp =
      order.customerWhatsapp ||
      order.accountContact ||
      '-';

    const amount = order.amount || order.total || '-';

    const formattedAmount = Number(amount).toLocaleString('id-ID');

    const message = `💰 PEMBAYARAN BERHASIL - DIGITAL EVO

📦 Kategori: ${category}
🔢 Jumlah: ${quantity}
👤 Username/Link: ${username}
📱 WhatsApp/Kontak: ${whatsapp}
💵 Total: Rp${formattedAmount}
💳 Pembayaran: QRIS

✅ Status: PEMBAYARAN BERHASIL
🕐 Waktu: ${paymentTime}`;

    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: message
      }
    );

    return res.json({
      success: true,
      message: 'Notifikasi pembayaran berhasil dikirim ke Telegram'
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

module.exports = app;
