module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan.' });
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return res.status(503).json({ error: 'Konfigurasi review server belum lengkap.' });
  const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
  const limit = Math.max(1, Math.min(6, Number(req.query.limit) || 6));
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Range: `${(page - 1) * limit}-${page * limit - 1}`, Prefer: 'count=exact' };
  try {
    const selectBase = 'id,name,body,rating,store_url,photo_url,pinned,created_at';
    const authHeaders = { ...headers, Range: `${(page - 1) * limit}-${page * limit - 1}` };
    // Fallback menjaga ulasan lama tetap tampil bila kolom tambahan belum dimigrasikan di Supabase.
    let response = await fetch(`${base}/rest/v1/comments?select=${selectBase},photo_urls,admin_reply&status=eq.approved&order=pinned.desc,created_at.desc`, { headers: authHeaders });
    if (!response.ok) response = await fetch(`${base}/rest/v1/comments?select=${selectBase},admin_reply&status=eq.approved&order=pinned.desc,created_at.desc`, { headers: authHeaders });
    if (!response.ok) response = await fetch(`${base}/rest/v1/comments?select=${selectBase}&status=eq.approved&order=pinned.desc,created_at.desc`, { headers: authHeaders });
    const ratingResponse = await fetch(`${base}/rest/v1/comments?select=rating&status=eq.approved`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) return res.status(500).json({ error: 'Ulasan belum dapat dimuat.' });
    const items = await response.json(); const ratings = ratingResponse.ok ? await ratingResponse.json() : [];
    for (const item of items) { item.photo_urls = Array.isArray(item.photo_urls) ? item.photo_urls : (item.photo_url ? [item.photo_url] : []); item.admin_reply = item.admin_reply || null; }
    const range = response.headers.get('content-range') || ''; const match = range.match(/\/(\d+)$/); const actualCount = match ? Number(match[1]) : 0;
    const total = 163 + actualCount;
    const average = ratings.length ? (ratings.reduce((sum, item) => sum + (Number(item.rating) || 5), 0) / ratings.length).toFixed(1) : '5.0';
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({ items, total, average });
  } catch { return res.status(500).json({ error: 'Ulasan belum dapat dimuat.' }); }
};
