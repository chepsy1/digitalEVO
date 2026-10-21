export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const gateway = String(process.env.PAYMENT_GATEWAY_URL || '').replace(/\/+$/, '');
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.API_KEY;
    if (!gateway || !apiKey) return res.status(500).json({ error: 'Payment gateway belum dikonfigurasi.' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const category = String(body.category || '').trim();
    const qty = Number(body.qty);
    if (!['followers','account','video_views','video_likes','video_comments','product_likes'].includes(category) || !Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Produk pembayaran tidak valid.' });
    }

    // Harga selalu diambil dari database. Nilai amount dari browser tidak dipercaya.
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Supabase server belum dikonfigurasi.' });
    }
    const supabaseBase = String(process.env.SUPABASE_URL).replace(/\/+$/, '');
    const productResponse = await fetch(
      `${supabaseBase}/rest/v1/products?category=eq.${encodeURIComponent(category)}&qty=eq.${encodeURIComponent(String(qty))}&select=id,category,qty,price&limit=1`,
      { headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }}
    );
    const productData = await productResponse.json();
    if (!productResponse.ok) {
      return res.status(500).json({ error: productData?.message || 'Gagal memverifikasi produk.' });
    }
    const product = productData?.[0];
    if(category==='video_comments'){const order=body.order&&typeof body.order==='object'?body.order:{};const comments=String(order.commentText||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(comments.length!==qty||comments.length>20)return res.status(400).json({error:`Paket ini memerlukan tepat ${qty} komentar, maksimal 20.`});}
    const amount = Number(product?.price);
    if (!product || !Number.isSafeInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Produk tidak ditemukan atau harga tidak valid.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(`${gateway}/create-qris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ amount: Math.round(amount) }),
        signal: controller.signal
      });
    } finally { clearTimeout(timeout); }

    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error || data?.message || `Gateway error (${response.status})`, details: data });
    }

    // Normalisasi beberapa bentuk respons gateway tanpa mengubah kontrak frontend lama.
    const d = data?.data || data?.result || data;
    const qrisUrl = d?.qris_url || d?.qr_url || d?.qrUrl || d?.qrImageUrl || data?.qris_url || data?.qr_url;
    const transactionId = d?.paymentId || d?.payment_id || d?.transactionId || d?.transaction_id ||
      d?.partnerReferenceNo || d?.partner_reference_no || d?.referenceNo || d?.reference_no || d?.id ||
      (qrisUrl ? String(qrisUrl).split('?')[0].split('/').filter(Boolean).pop() : null);
    const finalAmount = Number(d?.amount || data?.amount || amount);

    if (!qrisUrl && !d?.qrContent && !d?.qr_content && !d?.qrImage && !d?.qr_image) {
      return res.status(502).json({ error: 'Gateway tidak mengembalikan QRIS.', details: data });
    }

    // Tanpa ID transaksi yang bisa dipakai untuk rekonsiliasi, jangan tampilkan QRIS
    // seolah-olah pesanan sudah tercatat.
    if (!transactionId) {
      console.error('Gateway mengembalikan QRIS tanpa ID transaksi:', JSON.stringify({
        keys: Object.keys(d || {}),
        hasQrisUrl: Boolean(qrisUrl)
      }));
      return res.status(502).json({
        error: 'QRIS dibuat, tetapi ID transaksi tidak ditemukan sehingga pesanan belum bisa dicatat. Silakan hubungi admin sebelum mencoba membayar.'
      });
    }

    // Simpan data pesanan saat QRIS berhasil dibuat, sebelum pelanggan membayar.
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const order = body.order && typeof body.order === 'object' ? body.order : {};
      const now = new Date().toISOString();
      const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
      const record = {
        transaction_id: String(transactionId),
        customer_whatsapp: order.customerWhatsapp || null,
        account_contact: order.accountContact || null,
        shopee_link: ['followers','video_views','video_likes','video_comments','product_likes'].includes(category) ? (order.shopeeLink || null) : null,
        comment_text: category === 'video_comments' ? (String(order.commentText || order.comment_text || order.comments || '').trim() || null) : null,
        photo_url: category === 'followers' ? (order.photoUrl || null) : null,
        photo_path: category === 'followers' ? (order.photoPath || null) : null,
        product_id: isUuid(product.id) ? product.id : null,
        product_name: category === 'account' ? `Akun Shopee ${qty.toLocaleString('id-ID')} Followers` : category === 'video_views' ? `Shopee Video ${qty.toLocaleString('id-ID')} Views` : category === 'video_likes' ? `Shopee Video ${qty.toLocaleString('id-ID')} Likes` : category === 'video_comments' ? `Shopee Video ${qty.toLocaleString('id-ID')} (Custom) Comments` : category === 'product_likes' ? `Shopee Produk ${qty.toLocaleString('id-ID')} Favorite/Likes` : `${qty.toLocaleString('id-ID')} Followers`,
        category,
        quantity: 1,
        amount: Number.isSafeInteger(finalAmount) && finalAmount > 0 ? finalAmount : amount,
        payment_status: 'pending',
        order_status: 'pending',
        payment_method: 'QRIS',
        updated_at: now
      };
      const base = String(process.env.SUPABASE_URL).replace(/\/+$/, '');
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const saved = await fetch(`${base}/rest/v1/orders?on_conflict=transaction_id`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(record)
      });
      if (!saved.ok) {
        const detail = await saved.text();
        console.error('Gagal menyimpan pesanan pending:', saved.status, detail);
        return res.status(502).json({ error: 'QRIS berhasil dibuat, tetapi pesanan gagal disimpan. Jangan tutup halaman; hubungi admin sebelum mencoba membayar lagi.' });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        ...d,
        amount: finalAmount,
        qris_url: qrisUrl || null,
        payment_id: transactionId || null,
        qrContent: d?.qrContent || d?.qr_content || null,
        qrImage: d?.qrImage || d?.qr_image || null,
        expires_at: d?.expires_at || d?.expiresAt || data?.expires_at || null
      }
    });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Payment gateway timeout.' : (error?.message || 'Gagal menghubungi payment gateway.');
    return res.status(502).json({ error: message });
  }
}
