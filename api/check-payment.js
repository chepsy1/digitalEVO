export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const gateway = String(process.env.PAYMENT_GATEWAY_URL || '').replace(/\/+$/, '');
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.API_KEY;
    if (!gateway || !apiKey) return res.status(500).json({ error: 'Payment gateway belum dikonfigurasi.' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const payload = {
      ...body,
      paymentId: body.paymentId || body.payment_id || body.transactionId || body.transaction_id || body.id || undefined,
      amount: Number(body.amount || 0),
      startTime: Number(body.startTime || Math.floor(Date.now() / 1000))
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(`${gateway}/check-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally { clearTimeout(timeout); }

    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok) return res.status(response.status).json({ error: data?.error || data?.message || `Gateway error (${response.status})`, details: data });

    const d = data?.data || data?.result || data;
    const status = String(d?.status || data?.status || '').toUpperCase();
    const paid = d?.paid === true || data?.paid === true || ['PAID','SUCCESS','SUCCEEDED','COMPLETED','SETTLED'].includes(status);
    return res.status(200).json({ ...data, paid, status: status || data?.status || null });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Payment gateway timeout.' : (error?.message || 'Gagal menghubungi payment gateway.');
    return res.status(502).json({ error: message });
  }
}
