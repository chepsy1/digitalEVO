export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) return res.status(500).json({ error: 'Layanan cek pesanan belum dikonfigurasi.' });
    const input = String(req.body?.phone || '').trim();
    const digits = input.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return res.status(400).json({ error: 'Masukkan nomor WhatsApp yang valid.' });
    const variants = new Set([input, digits]);
    let national = digits;
    if (national.startsWith('62')) national = '0' + national.slice(2);
    if (national.startsWith('0')) {
      variants.add(national); variants.add('62' + national.slice(1)); variants.add('+62' + national.slice(1));
    } else {
      variants.add('0' + national); variants.add('62' + national); variants.add('+62' + national);
    }
    const clauses = [];
    for (const value of variants) {
      const safe = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      clauses.push('customer_whatsapp.eq."' + safe + '"', 'account_contact.eq."' + safe + '"');
    }
    const query = new URLSearchParams({
      select: 'id,transaction_id,product_name,payment_status,order_status,created_at,shopee_link',
      or: '(' + clauses.join(',') + ')', order: 'created_at.desc', limit: '20'
    });
    const response = await fetch(base + '/rest/v1/orders?' + query.toString(), {
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    const body = await response.text();
    if (!response.ok) {
      console.error('order-status query failed:', response.status, body);
      return res.status(500).json({ error: 'Tidak dapat mengambil status pesanan saat ini.' });
    }
    return res.status(200).json({ success: true, orders: body ? JSON.parse(body) : [] });
  } catch (error) {
    console.error('order-status error:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan saat memeriksa pesanan.' });
  }
}
