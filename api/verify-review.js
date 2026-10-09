const crypto = require('crypto');
function normalize(value) { let d = String(value || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '62' + d.slice(1); if (!d.startsWith('62')) d = '62' + d; return d; }
function sign(payload, secret) { const body = Buffer.from(JSON.stringify(payload)).toString('base64url'); return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url'); }
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan.' });
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY, secret = process.env.REVIEW_TOKEN_SECRET;
  if (!base || !key || !secret) return res.status(503).json({ error: 'Konfigurasi verifikasi review belum lengkap di Vercel.' });
  try {
    const raw = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const phone = normalize(raw.whatsapp);
    if (phone.length < 10 || phone.length > 15) return res.status(400).json({ error: 'Masukkan nomor WhatsApp yang valid.' });
    const response = await fetch(`${base}/rest/v1/orders?select=id,customer_whatsapp,payment_status&customer_whatsapp=not.is.null&limit=1000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) return res.status(500).json({ error: 'Database pesanan belum dapat diperiksa.' });
    const orders = await response.json();
    const match = orders.find(x => ['paid','success','succeeded','completed'].includes(String(x.payment_status || '').toLowerCase()) && normalize(x.customer_whatsapp) === phone);
    if (!match) return res.status(403).json({ error: 'Nomor yang anda masukkan tidak cocok dengan database kami atau pembayaran anda belum terkonfirmasi!. Hanya pembeli yang bisa mengirim komentar. Jika ingin bertanya silahkan Chat Admin Kami melalui WA.' });
    const token = sign({ phone, order: match.id, exp: Date.now() + 20 * 60 * 1000 }, secret);
    return res.status(200).json({ token });
  } catch { return res.status(500).json({ error: 'Verifikasi belum berhasil. Silakan coba kembali.' }); }
};
