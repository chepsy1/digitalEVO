function json(res, status, body) {
  return res.status(status).json(body);
}

async function supabaseFetch(path, options = {}) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.');
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const gateway = String(process.env.PAYMENT_GATEWAY_URL || '').replace(/\/+$/, '');
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.API_KEY;
    if (!gateway || !apiKey) return json(res, 500, { error: 'Payment gateway belum dikonfigurasi.' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const order = body.order && typeof body.order === 'object' ? body.order : {};
    const category = String(order.category || '').trim();
    const qty = Number(order.quantity || order.qty);
    const paymentId = String(body.paymentId || body.payment_id || body.transactionId || body.transaction_id || body.id || '').trim();
    if (!paymentId) return json(res, 400, { error: 'Payment ID tidak valid.' });

    const requestedItems = Array.isArray(order.items) && order.items.length
      ? order.items
      : [{ category, qty }];
    if (requestedItems.length > 20 || !['followers', 'account'].includes(category) ||
        requestedItems.some(item => String(item?.category || category).trim() !== category)) {
      return json(res, 400, { error: 'Produk pesanan tidak valid. Satu invoice hanya boleh berisi satu kategori.' });
    }

    const verifiedItems = [];
    for (const item of requestedItems) {
      const itemQty = Number(item?.qty);
      if (!Number.isInteger(itemQty) || itemQty <= 0) {
        return json(res, 400, { error: 'Paket dalam pesanan tidak valid.' });
      }
      const productResponse = await supabaseFetch(
        `/rest/v1/products?category=eq.${encodeURIComponent(category)}&qty=eq.${encodeURIComponent(String(itemQty))}&select=id,category,qty,price&limit=1`
      );
      const productRows = await productResponse.json();
      if (!productResponse.ok) return json(res, 500, { error: productRows?.message || 'Gagal memverifikasi produk.' });
      const product = productRows?.[0];
      const price = Number(product?.price);
      if (!product || !Number.isSafeInteger(price) || price <= 0) {
        return json(res, 400, { error: `Paket ${itemQty} tidak ditemukan atau harganya tidak valid.` });
      }
      verifiedItems.push({
        item_id: String(verifiedItems.length + 1),
        product_id: isUuid(product.id) ? String(product.id) : null,
        product_name: category === 'account'
          ? `Akun Shopee ${itemQty.toLocaleString('id-ID')} Followers`
          : `${itemQty.toLocaleString('id-ID')} Followers`,
        category,
        qty: itemQty,
        quantity: 1,
        amount: price,
        order_status: 'queued'
      });
    }
    const expectedAmount = verifiedItems.reduce((sum, item) => sum + item.amount, 0);
    if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0) {
      return json(res, 400, { error: 'Total pembayaran tidak valid.' });
    }
    const product = { id: verifiedItems[0].product_id, qty: verifiedItems[0].qty };
    const startTime = Number(body.startTime || Math.floor(Date.now() / 1000));
    const payload = {
      paymentId,
      // Penting: amount dikirim ke gateway dari database, bukan dari browser.
      amount: expectedAmount,
      startTime: Number.isFinite(startTime) ? startTime : Math.floor(Date.now() / 1000)
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(`${gateway}/check-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok) {
      return json(res, response.status, {
        error: data?.error || data?.message || `Gateway error (${response.status})`
      });
    }

    const d = data?.data || data?.result || data;
    const status = String(d?.status || data?.status || '').toUpperCase();
    const paid = d?.paid === true || data?.paid === true || ['PAID','SUCCESS','SUCCEEDED','COMPLETED','SETTLED'].includes(status);
    const gatewayAmount = Number(
      d?.amount ??
      d?.transaction?.amount ??
      data?.amount ??
      data?.transaction?.amount ??
      0
    );

    // Jika gateway memberi nominal transaksi, wajib sama dengan harga produk di database.
    // Ini mencegah manipulasi amount dari browser.
    if (paid && (!Number.isSafeInteger(gatewayAmount) || gatewayAmount !== expectedAmount)) {
      return json(res, 400, {
        error: 'Nominal pembayaran tidak sesuai dengan harga produk.',
        paid: false,
        orderRecorded: false
      });
    }

    let orderRecorded = false;
    let orderError = null;
    let orderWasNew = false;

    if (paid) {
      const transactionId = paymentId;
      const now = new Date().toISOString();
      const resolvedProductId = isUuid(product.id) ? String(product.id) : null;

      // Idempotency: polling status berkali-kali tidak boleh menggandakan sold.
      const existingResponse = await supabaseFetch(
        `/rest/v1/orders?transaction_id=eq.${encodeURIComponent(transactionId)}&select=id,transaction_id,payment_status,order_status,items&limit=1`
      );
      const existing = await existingResponse.json();
      if (!existingResponse.ok) {
        orderError = existing?.message || 'Gagal memeriksa order yang sudah ada.';
      } else if (existing?.[0]) {
        const current = existing[0];
        if (String(current.payment_status || '').toLowerCase() !== 'paid') {
          const update = await supabaseFetch(`/rest/v1/orders?transaction_id=eq.${encodeURIComponent(transactionId)}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ payment_status: 'paid', order_status: 'queued', paid_at: now, updated_at: now, amount: expectedAmount, quantity: verifiedItems.length, product_name: verifiedItems.map(item => item.product_name).join(' + '), items: verifiedItems })
          });
          if (!update.ok) {
            orderError = await update.text();
          } else {
            orderRecorded = true;
            orderWasNew = true;
          }
        } else {
          orderRecorded = true;
          orderWasNew = false;
        }
      } else {
        const record = {
          transaction_id: transactionId,
          customer_whatsapp: order.customerWhatsapp || null,
          account_contact: order.accountContact || null,
          shopee_link: category === 'followers' ? (order.shopeeLink || null) : null,
          photo_url: category === 'followers' ? (order.photoUrl || null) : null,
          photo_path: category === 'followers' ? (order.photoPath || null) : null,
          product_id: resolvedProductId,
          product_name: verifiedItems.map(item => item.product_name).join(' + '),
          category,
          quantity: verifiedItems.length,
          amount: expectedAmount,
          items: verifiedItems,
          payment_status: 'paid',
          order_status: 'queued',
          payment_method: 'QRIS',
          paid_at: now,
          updated_at: now
        };

        const insert = await supabaseFetch('/rest/v1/orders', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(record)
        });
        if (insert.ok) {
          orderRecorded = true;
          orderWasNew = true;
        } else {
          const orderRaw = await insert.text();
          let orderData = {};
          try { orderData = orderRaw ? JSON.parse(orderRaw) : {}; } catch {}
          orderError = orderData?.message || orderData?.details || orderData?.hint || orderRaw || `Gagal menyimpan order (${insert.status}).`;
        }


      }

      if (orderWasNew && orderRecorded) {
          // Perbarui jumlah terjual sekali untuk setiap item produk dalam invoice.
          try {
            const counts = new Map();
            for (const item of verifiedItems) {
              const key = String(item.product_id || item.qty);
              const current = counts.get(key) || { productId: item.product_id, qty: item.qty, count: 0 };
              current.count += 1;
              counts.set(key, current);
            }
            for (const item of counts.values()) {
              const productListResponse = await supabaseFetch(
                `/rest/v1/products?category=eq.${encodeURIComponent(category)}&qty=eq.${encodeURIComponent(String(item.qty))}&select=id,sold&limit=1`
              );
              const productList = await productListResponse.json();
              const liveProduct = productList?.[0];
              if (!liveProduct) continue;
              const soldRaw = String(liveProduct.sold ?? '').trim();
              const numericMatch = soldRaw.match(/^\\s*(\\d+(?:[.,]\\d+)?)\\s*$/);
              if (numericMatch) {
                const currentSold = Number(numericMatch[1].replace(',', '.'));
                const nextSold = Math.max(0, Math.round(currentSold + item.count));
                await supabaseFetch(
                  `/rest/v1/products?id=eq.${encodeURIComponent(String(liveProduct.id))}`,
                  { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sold: String(nextSold), updated_at: now }) }
                );
              }
            }
          } catch (soldError) {
            console.warn('Gagal memperbarui sold produk:', soldError);
          }
      }

      // Notifikasi dipanggil server-side saja; browser tidak lagi memiliki akses
      // untuk memicu email/Telegram secara bebas.
      if (orderRecorded && orderWasNew) {
        try {
          const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
          const host = String(req.headers.host || '').trim();
          if (host && process.env.SUPABASE_SERVICE_ROLE_KEY) {
            const notifyOrder = {
              ...order,
              category,
              quantity: verifiedItems.length,
              qty: verifiedItems[0].qty,
              items: verifiedItems,
              amount: expectedAmount,
              transaction: transactionId,
              paymentId: transactionId,
              product: category === 'account' ? `Account Premium` : `Followers Indonesia`,
              paymentTime: now
            };
            await fetch(`${proto}://${host}/api/notify-order`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Internal-Notify-Key': process.env.SUPABASE_SERVICE_ROLE_KEY
              },
              body: JSON.stringify(notifyOrder)
            });
          }
        } catch (notifyError) {
          console.warn('Notifikasi order gagal:', notifyError);
        }
      }
    }

    return json(res, 200, {
      ...data,
      paid,
      orderRecorded,
      orderError,
      status: status || data?.status || null
    });
  } catch (error) {
    return json(res, 502, {
      error: error?.name === 'AbortError' ? 'Payment gateway timeout.' : (error?.message || 'Gagal menghubungi payment gateway.')
    });
  }
}
