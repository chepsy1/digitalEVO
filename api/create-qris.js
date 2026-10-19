export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const gateway = String(process.env.PAYMENT_GATEWAY_URL || '').replace(/\\/+$/, '');
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.API_KEY;
    if (!gateway || !apiKey) return res.status(500).json({ error: 'Payment gateway belum dikonfigurasi.' });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Supabase server belum dikonfigurasi.' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const requestedItems = Array.isArray(body.items) && body.items.length
      ? body.items
      : [{ category: body.category, qty: body.qty, productId: body.productId }];
    if (requestedItems.length > 20) return res.status(400).json({ error: 'Maksimal 20 paket dalam satu checkout.' });

    const category = String(requestedItems[0]?.category || body.category || '').trim();
    if (!['followers', 'account'].includes(category) ||
        requestedItems.some(item => String(item?.category || category).trim() !== category)) {
      return res.status(400).json({ error: 'Satu invoice hanya boleh berisi satu kategori produk.' });
    }

    const supabaseBase = String(process.env.SUPABASE_URL).replace(/\\/+$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
    const items = [];
    for (const requested of requestedItems) {
      const qty = Number(requested?.qty);
      if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ error: 'Paket dalam pesanan tidak valid.' });
      const productResponse = await fetch(
        `${supabaseBase}/rest/v1/products?category=eq.${encodeURIComponent(category)}&qty=eq.${encodeURIComponent(String(qty))}&select=id,category,qty,price&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const productData = await productResponse.json();
      if (!productResponse.ok) return res.status(500).json({ error: productData?.message || 'Gagal memverifikasi produk.' });
      const product = productData?.[0];
      const price = Number(product?.price);
      if (!product || !Number.isSafeInteger(price) || price <= 0) {
        return res.status(400).json({ error: `Paket ${qty} tidak ditemukan atau harganya tidak valid.` });
      }
      items.push({
        product_id: isUuid(product.id) ? product.id : null,
        product_name: category === 'account'
          ? `Akun Shopee ${qty.toLocaleString('id-ID')} Followers`
          : `${qty.toLocaleString('id-ID')} Followers`,
        category,
        qty,
        quantity: 1,
        amount: price,
        order_status: 'queued'
      });
    }
    const amount = items.reduce((sum, item) => sum + item.amount, 0);
    if (!Number.isSafeInteger(amount) || amount <= 0) return res.status(400).json({ error: 'Total pembayaran tidak valid.' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(`${gateway}/create-qris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ amount: Math.round(amount) }),
        signal: controller.signal
      });
    } finally { clearTimeout(timeout); }

    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error || data?.message || `Gateway error (${response.status})`, details: data });
    }

    const d = data?.data || data?.result || data;
    const qrisUrl = d?.qris_url || d?.qr_url || d?.qrUrl || d?.qrImageUrl || data?.qris_url || data?.qr_url;
    const transactionId = d?.paymentId || d?.payment_id || d?.transactionId || d?.transaction_id ||
      d?.partnerReferenceNo || d?.partner_reference_no || d?.referenceNo || d?.reference_no || d?.id ||
      (qrisUrl ? String(qrisUrl).split('?')[0].split('/').filter(Boolean).pop() : null);
    const finalAmount = Number(d?.amount ?? data?.amount ?? amount);
    if (!qrisUrl && !d?.qrContent && !d?.qr_content && !d?.qrImage && !d?.qr_image) {
      return res.status(502).json({ error: 'Gateway tidak mengembalikan QRIS.', details: data });
    }
    if (!transactionId) {
      console.error('Gateway mengembalikan QRIS tanpa ID transaksi:', JSON.stringify({ keys: Object.keys(d || {}), hasQrisUrl: Boolean(qrisUrl) }));
      return res.status(502).json({ error: 'QRIS dibuat, tetapi ID transaksi tidak ditemukan sehingga pesanan belum bisa dicatat. Silakan hubungi admin sebelum mencoba membayar.' });
    }
    if (!Number.isSafeInteger(finalAmount) || finalAmount !== amount) {
      return res.status(502).json({ error: 'Nominal QRIS dari gateway tidak sesuai dengan total paket.' });
    }

    const order = body.order && typeof body.order === 'object' ? body.order : {};
    const now = new Date().toISOString();
    const record = {
      transaction_id: String(transactionId),
      customer_whatsapp: order.customerWhatsapp || null,
      account_contact: order.accountContact || null,
      shopee_link: category === 'followers' ? (order.shopeeLink || null) : null,
      photo_url: category === 'followers' ? (order.photoUrl || null) : null,
      photo_path: category === 'followers' ? (order.photoPath || null) : null,
      product_id: items[0].product_id,
      product_name: items.map(item => item.product_name).join(' + '),
      category,
      quantity: items.length,
      amount: finalAmount,
      items: items.map((item, index) => ({ ...item, item_id: String(index + 1), order_status: 'queued' })),
      payment_status: 'pending',
      order_status: 'pending',
      payment_method: 'QRIS',
      updated_at: now
    };
    const saved = await fetch(`${supabaseBase}/rest/v1/orders?on_conflict=transaction_id`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(record)
    });
    if (!saved.ok) {
      const detail = await saved.text();
      console.error('Gagal menyimpan pesanan pending:', saved.status, detail);
      return res.status(502).json({ error: 'QRIS berhasil dibuat, tetapi pesanan gagal disimpan. Jangan tutup halaman; hubungi admin sebelum mencoba membayar lagi.' });
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
