export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const gateway = String(process.env.PAYMENT_GATEWAY_URL || '').replace(/\/+$/, '');
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.API_KEY;

    if (!gateway || !apiKey) {
      return res.status(500).json({ error: 'Payment gateway belum dikonfigurasi.' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const payload = {
      ...body,
      paymentId:
        body.paymentId ||
        body.payment_id ||
        body.transactionId ||
        body.transaction_id ||
        body.id,
      amount: Number(body.amount || 0),
      startTime: Number(body.startTime || Math.floor(Date.now() / 1000))
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await fetch(`${gateway}/check-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
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
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error || data?.message || `Gateway error (${response.status})`,
        details: data
      });
    }

    const d = data?.data || data?.result || data;
    const status = String(d?.status || data?.status || '').toUpperCase();
    const paid =
      d?.paid === true ||
      data?.paid === true ||
      ['PAID', 'SUCCESS', 'SUCCEEDED', 'COMPLETED', 'SETTLED'].includes(status);

    let orderRecorded = false;
    let orderError = null;

    // Saat pembayaran benar-benar PAID, simpan transaksi ke Supabase.
    // Jangan mengandalkan browser untuk mencatat order; server menggunakan
    // service-role key agar dashboard admin selalu menerima transaksi.
    if (paid) {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        orderError = 'SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum tersedia di Vercel.';
      } else {
        const order = body.order || {};
        const transactionId = String(payload.paymentId || order.transaction || '').trim();

        if (!transactionId) {
          orderError = 'Transaction/payment ID kosong sehingga order tidak dapat dicatat.';
        } else {
          const now = new Date().toISOString();
          const qty = Math.max(1, Number(order.quantity || order.qty || 1));
          const amount = Math.max(0, Number(payload.amount || order.amount || 0));

          const record = {
            transaction_id: transactionId,
            customer_whatsapp: order.customerWhatsapp || null,
            account_contact: order.accountContact || null,
            product_name: order.product || null,
            category: order.category || null,
            quantity: qty,
            amount,
            payment_status: 'paid',
            order_status: 'completed',
            payment_method: 'QRIS',
            paid_at: now,
            updated_at: now
          };

          try {
            const base = process.env.SUPABASE_URL.replace(/\/+$/, '');
            const orderResponse = await fetch(
              `${base}/rest/v1/orders?on_conflict=transaction_id`,
              {
                method: 'POST',
                headers: {
                  'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                  'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'resolution=merge-duplicates,return=minimal'
                },
                body: JSON.stringify(record)
              }
            );

            if (orderResponse.ok) {
              orderRecorded = true;
            } else {
              const orderRaw = await orderResponse.text();
              let orderData = {};
              try { orderData = orderRaw ? JSON.parse(orderRaw) : {}; } catch {}
              orderError =
                orderData?.message ||
                orderData?.details ||
                orderData?.hint ||
                orderData?.error ||
                orderRaw ||
                `Gagal menyimpan order (${orderResponse.status}).`;
            }

            // Perbarui indikator sold produk berdasarkan kategori + qty.
            // Ini sengaja tidak bergantung pada products.id karena database lama
            // dapat memiliki ID numerik sementara orders.product_id adalah UUID.
            if (orderRecorded && order.category && Number.isFinite(qty)) {
              try {
                const productResponse = await fetch(
                  `${base}/rest/v1/products?category=eq.${encodeURIComponent(String(order.category))}&qty=eq.${encodeURIComponent(String(qty))}&select=id,sold`,
                  {
                    headers: {
                      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                    }
                  }
                );

                if (productResponse.ok) {
                  const products = await productResponse.json();
                  const product = products?.[0];

                  if (product) {
                    const currentSoldRaw = String(product.sold ?? '').trim();
                    // Hanya menaikkan sold jika nilainya numerik. Nilai seperti
                    // "20+" tetap dibiarkan agar label marketing tidak rusak.
                    const numericMatch = currentSoldRaw.match(/^\s*(\d+(?:[.,]\d+)?)\s*$/);
                    if (numericMatch) {
                      const currentSold = Number(numericMatch[1].replace(',', '.'));
                      const nextSold = Math.max(0, Math.round(currentSold + qty));
                      await fetch(
                        `${base}/rest/v1/products?id=eq.${encodeURIComponent(String(product.id))}`,
                        {
                          method: 'PATCH',
                          headers: {
                            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                          },
                          body: JSON.stringify({
                            sold: String(nextSold),
                            updated_at: now
                          })
                        }
                      );
                    }
                  }
                }
              } catch (soldError) {
                // Statistik dashboard tetap berasal dari orders; kegagalan label
                // sold tidak boleh membatalkan order yang sudah tercatat.
                console.warn('Gagal memperbarui sold produk:', soldError);
              }
            }
          } catch (dbError) {
            orderError = dbError?.message || 'Gagal menghubungi Supabase.';
          }
        }
      }
    }

    return res.status(200).json({
      ...data,
      paid,
      orderRecorded,
      orderError,
      status: status || data?.status || null
    });
  } catch (error) {
    return res.status(502).json({
      error:
        error?.name === 'AbortError'
          ? 'Payment gateway timeout.'
          : (error?.message || 'Gagal menghubungi payment gateway.')
    });
  }
}
