function reply(res, status, body) { return res.status(status).json(body); }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function currentUser(req) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const authorization = String(req.headers.authorization || '');
  if (!base || !anonKey || !authorization.startsWith('Bearer ')) return null;
  const response = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization }
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id && UUID_RE.test(user.id) ? user : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { success: false, error: 'Method not allowed' });

  try {
    const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const user = await currentUser(req);
    if (!base || !serviceKey) return reply(res, 500, { success: false, error: 'Konfigurasi server member belum lengkap.' });
    if (!user) return reply(res, 401, { success: false, error: 'Silakan login sebagai member terlebih dahulu.' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const category = String(body.category || '').trim();
    const qty = Number(body.qty);
    const allowed = ['followers', 'account', 'video_views', 'video_likes', 'video_comments', 'product_likes'];
    if (!allowed.includes(category) || !Number.isSafeInteger(qty) || qty <= 0) {
      return reply(res, 400, { success: false, error: 'Produk atau paket tidak valid.' });
    }
    const order = body.order && typeof body.order === 'object' && !Array.isArray(body.order) ? body.order : {};

    // The database function independently validates active membership, live product
    // and member price, required checkout fields, wallet balance and ledger writes.
    const response = await fetch(`${base}/rest/v1/rpc/member_checkout_with_wallet`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_user_id: user.id,
        p_category: category,
        p_qty: qty,
        p_order: order
      })
    });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
    if (!response.ok) {
      const message = String(data?.message || data?.details || data?.hint || 'Checkout saldo gagal.');
      const status = /saldo member tidak mencukupi/i.test(message) ? 409 :
        /keanggotaan aktif/i.test(message) ? 403 :
        /memerlukan|harus sesuai|tidak valid|tidak ditemukan/i.test(message) ? 400 : 500;
      return reply(res, status, { success: false, error: message.replace(/^.*ERROR:\s*/i, '') });
    }
    const result = Array.isArray(data) ? data[0] : data;
    const checkout = result || { success: true };

    // Notify the shop after the order and wallet debit have committed. Notification
    // failures must not undo or misreport a successful purchase.
    try {
      const appHost = String(process.env.VERCEL_URL || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
      if (appHost && /^[a-zA-Z0-9.-]+(?::\d+)?$/.test(appHost)) {
      const notifyResponse = await fetch(`https://${appHost}/api/notify-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-notify-key': serviceKey
        },
        body: JSON.stringify({
          transaction: checkout.invoice || checkout.order_id || 'Pesanan Saldo Member',
          category,
          qty,
          quantity: qty,
          amount: checkout.amount,
          total: checkout.amount,
          productName: checkout.product_name || category,
          customerWhatsapp: order.customerWhatsapp || order.customer_whatsapp || '',
          accountContact: order.accountContact || order.account_contact || '',
          accountName: order.accountName || order.account_name || '',
          shopeeLink: order.shopeeLink || order.shopee_link || '',
          commentText: order.commentText || order.comment_text || '',
          photoUrl: order.photoUrl || order.photo_url || '',
          photoName: order.photoName || order.photo_name || ''
        })
      });
      if (!notifyResponse.ok) console.error('Notifikasi pesanan saldo member gagal:', notifyResponse.status, await notifyResponse.text());
      }
    } catch (notifyError) {
      console.error('Notifikasi pesanan saldo member gagal:', notifyError?.message || notifyError);
    }

    return reply(res, 200, checkout);
  } catch (error) {
    console.error('member-checkout error:', error);
    return reply(res, 500, { success: false, error: 'Terjadi kesalahan saat checkout saldo member.' });
  }
}
