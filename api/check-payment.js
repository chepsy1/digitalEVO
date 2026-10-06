export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const gateway = String(process.env.PAYMENT_GATEWAY_URL || '').replace(/\/+$/, '');
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.API_KEY;

    if (!gateway || !apiKey) {
      return res.status(500).json({
        error: 'Payment gateway belum dikonfigurasi.'
      });
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

    // Persist a paid order server-side when the browser supplies the pending order.
    // The service-role key must only exist in Vercel environment variables.
    let orderRecorded = false;
    if (paid && body?.order && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const order = body.order || {};
      const record = {
        transaction_id: String(payload.paymentId || order.transaction || ''),
        customer_whatsapp: order.customerWhatsapp || null,
        account_contact: order.accountContact || null,
        product_name: order.product || null,
        category: order.category || null,
        quantity: Number(order.quantity || 1),
        amount: Number(payload.amount || order.amount || 0),
        payment_status: 'paid',
        order_status: 'processing',
        payment_method: 'QRIS',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (record.transaction_id) {
        const responseOrder = await fetch(
          `${process.env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/orders?on_conflict=transaction_id`,
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
        orderRecorded = responseOrder.ok;
      }
    }

    return res.status(200).json({
      ...data,
      paid,
      orderRecorded,
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
