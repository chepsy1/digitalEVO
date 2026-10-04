const crypto = require('crypto');

function json(res, body, status = 200) {
  res.status(status).setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, { message: 'Method not allowed' }, 405);

  const gatewayUrl = String(process.env.PAYMENT_GATEWAY_URL || '').replace(/\/$/, '');
  const apiKey = String(process.env.PAYMENT_GATEWAY_API_KEY || '');
  if (!gatewayUrl || !apiKey) {
    return json(res, { message: 'Payment gateway belum dikonfigurasi di Vercel.' }, 500);
  }

  try {
    const input = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const qty = Number(input.qty);
    if (!Number.isInteger(qty) || qty <= 0) return json(res, { message: 'Produk tidak valid.' }, 400);

    // Price is loaded from Supabase on the client, but the server must never trust
    // a browser-supplied amount. Fetch the product price from the existing Supabase
    // REST API using the public read key.
    const supabaseUrl = String(process.env.SUPABASE_URL || '');
    const supabaseKey = String(process.env.SUPABASE_ANON_KEY || '');
    if (!supabaseUrl || !supabaseKey) {
      return json(res, { message: 'Supabase belum dikonfigurasi di Vercel.' }, 500);
    }

    const category = input.category === 'account' ? 'account' : 'followers';
    const query = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/products?select=category,qty,price&category=eq.${encodeURIComponent(category)}&qty=eq.${encodeURIComponent(qty)}&limit=1`;
    const productResponse = await fetch(query, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    const products = await productResponse.json().catch(() => []);
    const product = Array.isArray(products) ? products[0] : null;
    if (!product || !product.price) return json(res, { message: 'Produk tidak ditemukan.' }, 404);

    const amount = Number(product.price);
    const startTime = Math.floor(Date.now() / 1000);
    const paymentId = crypto.randomUUID();
    const partnerReferenceNo = `EVO${Date.now()}${crypto.randomBytes(4).toString('hex')}`.slice(0, 25);

    const gatewayResponse = await fetch(`${gatewayUrl}/create-qris`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify({ amount })
    });
    const gateway = await gatewayResponse.json().catch(() => ({}));
    if (!gatewayResponse.ok || gateway.success === false) {
      return json(res, { message: gateway.message || gateway.error || `Gateway error (${gatewayResponse.status})` }, 502);
    }

    const data = gateway.data || gateway;
    if (!data.qris_url && !data.qrUrl && !data.qrContent) {
      return json(res, { message: 'Gateway tidak mengembalikan QRIS.' }, 502);
    }

    return json(res, {
      paymentId,
      partnerReferenceNo,
      amount,
      startTime,
      qrUrl: data.qris_url || data.qrUrl || null,
      qrContent: data.qrContent || null,
      qrImage: data.qrImage || null,
      expiresAt: data.expires_at || data.expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
  } catch (error) {
    return json(res, { message: error?.message || 'Internal error' }, 500);
  }
};
