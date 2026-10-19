function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(status).json(body);
}
function phoneCandidates(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return [];
  const set = new Set([digits]);
  if (digits.startsWith('62')) { set.add('0' + digits.slice(2)); set.add('+' + digits); }
  else if (digits.startsWith('0')) { set.add('62' + digits.slice(1)); set.add('+62' + digits.slice(1)); }
  else if (digits.startsWith('8')) { set.add('0' + digits); set.add('62' + digits); set.add('+62' + digits); }
  return [...set].filter(value => value.length >= 8 && value.length <= 16);
}
function publicStatus(value) {
  const status = String(value || '').toLowerCase();
  if (['queued','pending','waiting','in_queue','antrian'].includes(status)) return {label:'Dalam Antrian',key:'queued'};
  if (['processing','in_progress','diproses'].includes(status)) return {label:'Diproses',key:'processing'};
  if (['completed','success','successful','berhasil','done'].includes(status)) return {label:'Berhasil',key:'completed'};
  return {label:'Dalam Antrian',key:'queued'};
}
function paymentLabel(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'paid') return 'Berhasil';
  if (status === 'expired') return 'Kedaluwarsa';
  if (status === 'failed') return 'Gagal';
  return 'Menunggu Pembayaran';
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, {error:'Metode tidak diizinkan.'});
  try {
    const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) {
      const missing = [!base && 'SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean);
      console.error('Order status config missing:', missing.join(', '));
      return json(res, 500, {error:'Konfigurasi server belum lengkap: ' + missing.join(', ') + '. Periksa Environment Variables pada deployment Preview.'});
    }
    const candidates = phoneCandidates(req.body && req.body.phone);
    if (!candidates.length) return json(res, 400, {error:'Masukkan nomor handphone yang valid.'});
    const inList = candidates.map(value => encodeURIComponent(value)).join(',');
    const filter = 'or=(customer_whatsapp.in.(' + inList + '),account_contact.in.(' + inList + '))';
    const url = base + '/rest/v1/orders?' + filter + '&select=id,transaction_id,product_name,amount,payment_status,order_status,payment_method,created_at,paid_at&order=created_at.desc&limit=50';
    const response = await fetch(url, {headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'}});
    const raw = await response.text();
    let rows;
    try { rows = raw ? JSON.parse(raw) : []; } catch { rows = []; }
    if (!response.ok) {
      console.error('Order status lookup failed:', response.status, raw);
      return json(res, 500, {error:'Tidak dapat memeriksa pesanan saat ini. Silakan coba lagi.'});
    }
    const normalized = new Set(candidates.map(value => value.replace(/\D/g, '')));
    const matches = (Array.isArray(rows) ? rows : []).filter(order =>
      [order.customer_whatsapp, order.account_contact].some(value => normalized.has(String(value || '').replace(/\D/g, '')))
    ).map(order => ({
      invoice:String(order.transaction_id || order.id || '-'),
      product:String(order.product_name || 'Pesanan DigitalEVO'),
      amount:Number(order.amount || 0),
      paymentStatus:paymentLabel(order.payment_status),
      paymentKey:String(order.payment_status || 'pending').toLowerCase(),
      paymentMethod:String(order.payment_method || 'QRIS'),
      createdAt:order.created_at || null,
      paidAt:order.paid_at || null,
      orderStatus:publicStatus(order.order_status)
    }));
    if (!matches.length) return json(res, 404, {found:false,message:'Maaf, Nomor anda Belum pernah melakukan Pembelian Di Toko Kami'});
    return json(res, 200, {found:true,orders:matches});
  } catch (error) {
    console.error('Order status lookup error:', error);
    return json(res, 500, {error:'Terjadi kendala saat memeriksa pesanan. Silakan coba kembali.'});
  }
}