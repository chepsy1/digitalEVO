export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!base || !serviceKey || !anonKey || !token) {
      return res.status(401).json({ error: 'Sesi admin tidak valid.' });
    }

    const userResponse = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
    });
    if (!userResponse.ok) return res.status(401).json({ error: 'Silakan login admin kembali.' });

    const adminResponse = await fetch(`${base}/rest/v1/rpc/is_admin`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    if (!adminResponse.ok || (await adminResponse.text()) !== 'true') {
      return res.status(403).json({ error: 'Akses admin ditolak.' });
    }

    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    };
    const action = String(req.body?.action || '');

    if (action === 'expire') {
      const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const response = await fetch(
        `${base}/rest/v1/orders?payment_status=eq.pending&created_at=lt.${encodeURIComponent(cutoff)}&select=id`,
        { method: 'PATCH', headers, body: JSON.stringify({ payment_status: 'expired', order_status: 'expired', updated_at: new Date().toISOString() }) }
      );
      const text = await response.text();
      if (!response.ok) return res.status(500).json({ error: 'Gagal memperbarui pesanan kedaluwarsa.', details: text });
      return res.status(200).json({ success: true, updated: text ? JSON.parse(text).length : 0 });
    }

    if (action === 'set_order_status') {
      const id = String(req.body?.id || '');
      const orderStatus = String(req.body?.order_status || '').toLowerCase();
      if (!id) return res.status(400).json({ error: 'ID pesanan tidak valid.' });
      if (!['queued', 'processing', 'completed'].includes(orderStatus)) {
        return res.status(400).json({ error: 'Status pengerjaan tidak valid.' });
      }
      const response = await fetch(
        base + '/rest/v1/orders?id=eq.' + encodeURIComponent(id) + '&or=(payment_status.eq.paid,status.eq.paid)&select=id,order_status',
        { method: 'PATCH', headers, body: JSON.stringify({ order_status: orderStatus, updated_at: new Date().toISOString() }) }
      );
      const text = await response.text();
      if (!response.ok) return res.status(500).json({ error: 'Gagal memperbarui status pengerjaan.', details: text });
      const updated = text ? JSON.parse(text) : [];
      if (!updated.length) return res.status(409).json({ error: 'Pesanan belum dibayar atau tidak ditemukan.' });
      return res.status(200).json({ success: true, order: updated[0] });
    }

    if (action === 'mark_paid') {
      const id = String(req.body?.id || '');
      if (!id) return res.status(400).json({ error: 'ID pesanan tidak valid.' });

      // Hanya pesanan yang belum berstatus berhasil yang dapat ditandai manual.
      const response = await fetch(
        `${base}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&payment_status=in.(pending,expired)&select=*`,
        { method: 'PATCH', headers, body: JSON.stringify({
          payment_status: 'paid',
          order_status: 'queued',
          updated_at: new Date().toISOString()
        }) }
      );
      const text = await response.text();
      if (!response.ok) return res.status(500).json({ error: 'Gagal memperbarui status pesanan.', details: text });
      const updated = text ? JSON.parse(text) : [];
      if (!updated.length) return res.status(409).json({ error: 'Pesanan tidak ditemukan atau sudah berstatus berhasil.' });

      // Catat ke analytics agar grafik pendapatan ikut terbarui.
      const order = updated[0];
      const analyticsResponse = await fetch(`${base}/rest/v1/analytics_events`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          visitor_id: `admin-manual-${String(order.id)}`.slice(0, 120),
          event_type: 'checkout_paid',
          page_path: '/admin.html',
          product_name: String(order.product_name || order.product || 'Pesanan manual'),
          quantity: Number(order.quantity || order.qty || 1),
          value: Number(order.amount || order.total || 0),
          metadata: { source: 'admin_manual_mark_paid', order_id: String(order.id) }
        })
      });
      if (!analyticsResponse.ok) {
        console.error('Order ditandai berhasil, tetapi analytics event gagal:', await analyticsResponse.text());
      }
      return res.status(200).json({ success: true, order: updated[0] });
    }

    if (action === 'delete') {
      const id = String(req.body?.id || '');
      if (!id) return res.status(400).json({ error: 'ID pesanan tidak valid.' });
      const response = await fetch(
        `${base}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&payment_status=in.(pending,expired)&select=id`,
        { method: 'DELETE', headers }
      );
      const text = await response.text();
      if (!response.ok) return res.status(500).json({ error: 'Gagal menghapus pesanan.', details: text });
      if (!text || JSON.parse(text).length === 0) {
        return res.status(409).json({ error: 'Pesanan tidak ditemukan atau sudah dibayar.' });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Aksi tidak dikenal.' });
  } catch (error) {
    console.error('admin-orders error:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan saat mengelola pesanan.' });
  }
}
