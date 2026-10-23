module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan.' });
  const base = String(process.env.SUPABASE_URL || '').replace(/\\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return res.status(503).json({ error: 'Konfigurasi review server belum lengkap.' });
  const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
  const limit = Math.max(1, Math.min(6, Number(req.query.limit) || 6));
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' };
  try {
    const selectBase = 'id,name,body,rating,store_url,photo_url,pinned,created_at';
    // Ambil semua ulasan yang disetujui agar urutan acak konsisten lintas halaman.
    let response = await fetch(`${base}/rest/v1/comments?select=${selectBase},photo_urls,admin_reply&status=eq.approved&order=pinned.desc,created_at.desc`, { headers });
    if (!response.ok) response = await fetch(`${base}/rest/v1/comments?select=${selectBase},admin_reply&status=eq.approved&order=pinned.desc,created_at.desc`, { headers });
    if (!response.ok) response = await fetch(`${base}/rest/v1/comments?select=${selectBase}&status=eq.approved&order=pinned.desc,created_at.desc`, { headers });
    const ratingResponse = await fetch(`${base}/rest/v1/comments?select=rating&status=eq.approved`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) return res.status(500).json({ error: 'Ulasan belum dapat dimuat.' });

    const allItems = await response.json();
    const ratings = ratingResponse.ok ? await ratingResponse.json() : [];
    for (const item of allItems) {
      item.photo_urls = Array.isArray(item.photo_urls) ? item.photo_urls : (item.photo_url ? [item.photo_url] : []);
      item.admin_reply = item.admin_reply || null;
    }

    // Seed harian zona Makassar: urutan sama sepanjang hari, berganti pada hari berikutnya.
    const dayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const stableHash = value => {
      let hash = 2166136261;
      for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    };
    const pinnedItems = allItems.filter(item => item.pinned);
    const regularItems = allItems.filter(item => !item.pinned);
    regularItems.sort((a, b) => {
      const ah = stableHash(`${dayKey}:${a.id}`);
      const bh = stableHash(`${dayKey}:${b.id}`);
      return ah - bh;
    });
    const shuffledItems = [...pinnedItems, ...regularItems];
    const items = shuffledItems.slice((page - 1) * limit, page * limit);

    const range = response.headers.get('content-range') || '';
    const match = range.match(/\\/(\\d+)$/);
    const actualCount = match ? Number(match[1]) : allItems.length;
    const total = 413 + actualCount;
    const average = ratings.length ? (ratings.reduce((sum, item) => sum + (Number(item.rating) || 5), 0) / ratings.length).toFixed(1) : '5.0';
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ items, total, average });
  } catch {
    return res.status(500).json({ error: 'Ulasan belum dapat dimuat.' });
  }
};
