function escapeHtml(value) {
  return String(value ?? '-')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatRupiah(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '-';
  return `Rp${amount.toLocaleString('id-ID')}`;
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return escapeHtml(value || '-');

  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Makassar',
    dateStyle: 'full',
    timeStyle: 'medium'
  });
}

function buildEmailHtml(order) {
  const category = order.category === 'account'
    ? 'Account Premium'
    : order.category === 'followers'
      ? 'Followers Indonesia'
      : (order.category || '-');

  const quantity = order.qty ?? order.quantity ?? '-';
  const target = order.shopeeLink || order.username || order.accountName || '-';
  const contact = order.customerWhatsapp || order.accountContact || '-';
  const amount = formatRupiah(order.amount || order.total);

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pesanan Baru - digitalEVO</title>
</head>
<body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
  <div style="max-width:620px;margin:0 auto;padding:28px 16px;">
    <div style="background:#111827;color:#fff;border-radius:16px 16px 0 0;padding:22px 24px;">
      <div style="font-size:13px;opacity:.8;">DIGITALEVO.STORE</div>
      <h1 style="margin:7px 0 0;font-size:24px;">🔔 Pesanan Baru</h1>
      <div style="margin-top:7px;font-size:14px;opacity:.9;">Pembayaran telah terkonfirmasi.</div>
    </div>

    <div style="background:#fff;padding:24px;border-radius:0 0 16px 16px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:10px 0;color:#6b7280;">Nomor transaksi</td><td style="padding:10px 0;text-align:right;font-weight:700;">${escapeHtml(order.transaction || order.paymentId || '-')}</td></tr>
        <tr><td style="padding:10px 0;color:#6b7280;border-top:1px solid #e5e7eb;">Produk</td><td style="padding:10px 0;text-align:right;font-weight:700;border-top:1px solid #e5e7eb;">${escapeHtml(category)}</td></tr>
        <tr><td style="padding:10px 0;color:#6b7280;border-top:1px solid #e5e7eb;">Jumlah</td><td style="padding:10px 0;text-align:right;font-weight:700;border-top:1px solid #e5e7eb;">${escapeHtml(quantity)}</td></tr>
        <tr><td style="padding:10px 0;color:#6b7280;border-top:1px solid #e5e7eb;">Username / Link Shopee</td><td style="padding:10px 0;text-align:right;font-weight:700;word-break:break-word;border-top:1px solid #e5e7eb;">${escapeHtml(target)}</td></tr>
        <tr><td style="padding:10px 0;color:#6b7280;border-top:1px solid #e5e7eb;">WhatsApp / Kontak</td><td style="padding:10px 0;text-align:right;font-weight:700;border-top:1px solid #e5e7eb;">${escapeHtml(contact)}</td></tr>
        <tr><td style="padding:10px 0;color:#6b7280;border-top:1px solid #e5e7eb;">Total</td><td style="padding:10px 0;text-align:right;font-size:18px;font-weight:800;border-top:1px solid #e5e7eb;">${escapeHtml(amount)}</td></tr>
        <tr><td style="padding:10px 0;color:#6b7280;border-top:1px solid #e5e7eb;">Waktu pembayaran</td><td style="padding:10px 0;text-align:right;font-weight:700;border-top:1px solid #e5e7eb;">${escapeHtml(formatDate(order.paymentTime))}</td></tr>
      </table>

      <div style="margin-top:22px;padding:14px 16px;border-radius:10px;background:#ecfdf5;color:#166534;font-weight:700;">
        Status: PEMBAYARAN BERHASIL
      </div>

      ${order.photoUrl ? `
      <div style="margin-top:22px;padding-top:20px;border-top:1px solid #e5e7eb;">
        <div style="font-size:13px;color:#6b7280;margin-bottom:8px;">Foto / Screenshot Akun Shopee</div>
        <a href="${escapeHtml(order.photoUrl)}" target="_blank" rel="noopener" style="display:inline-block;color:#ea580c;font-weight:800;text-decoration:none;margin-bottom:12px;">Buka foto asli →</a>
        <img src="${escapeHtml(order.photoUrl)}" alt="Screenshot akun Shopee" style="display:block;width:100%;max-width:560px;height:auto;border:1px solid #e5e7eb;border-radius:12px;" />
      </div>` : ''}
    </div>
  </div>
</body>
</html>`;
}

async function sendEmailNotification(order) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !to || !from) {
    return {
      configured: false,
      success: false,
      error: 'Email belum dikonfigurasi. Isi RESEND_API_KEY, NOTIFY_EMAIL, dan RESEND_FROM di Vercel.'
    };
  }

  const transaction = order.transaction || order.paymentId || 'Pesanan';
  const category = order.category === 'account'
    ? 'Account Premium'
    : order.category === 'followers'
      ? 'Followers Indonesia'
      : (order.category || 'Pesanan');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `🔔 Pesanan Baru #${transaction} — ${category}`,
      html: buildEmailHtml(order)
    })
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Resend error (${response.status})`);
  }

  return {
    configured: true,
    success: true,
    id: data?.id || null
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Hanya server internal setelah pembayaran terverifikasi yang boleh memicu
  // email/Telegram. Kunci ini tidak pernah dikirim ke browser.
  const internalKey = String(req.headers['x-internal-notify-key'] || '');
  if (!internalKey || internalKey !== String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }

  const order = req.body && typeof req.body === 'object' ? req.body : {};
  const result = {
    success: true,
    email: { success: false },
    telegram: { success: false }
  };

  // Email dibuat independen dari Telegram supaya notifikasi email tetap masuk
  // walaupun layanan Telegram/gateway sedang bermasalah.
  try {
    result.email = await sendEmailNotification(order);
  } catch (error) {
    result.email = {
      configured: true,
      success: false,
      error: error?.message || 'Gagal mengirim email notifikasi'
    };
  }

  // Pertahankan notifikasi Telegram yang sudah ada.
  try {
    const gateway = String(process.env.PAYMENT_GATEWAY_URL || '').replace(/\/+$/, '');
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY;

    if (gateway && apiKey) {
      const response = await fetch(`${gateway}/api/notify-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify(order)
      });

      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw };
      }

      result.telegram = {
        success: response.ok,
        status: response.status,
        data
      };
    } else {
      result.telegram = {
        success: false,
        skipped: true,
        error: 'Gateway Telegram belum dikonfigurasi.'
      };
    }
  } catch (error) {
    result.telegram = {
      success: false,
      error: error?.message || 'Gagal mengirim notifikasi Telegram'
    };
  }

  return res.status(200).json(result);
}
