function json(res, body, status = 200) {
  res.status(status).setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, { message: 'Method not allowed' }, 405);

  const gatewayUrl = String(process.env.PAYMENT_GATEWAY_URL || '').replace(/\/$/, '');
  const apiKey = String(process.env.PAYMENT_GATEWAY_API_KEY || '');
  if (!gatewayUrl || !apiKey) {
    return json(res, { message: 'Payment gateway belum dikonfigurasi di Vercel.' }, 500);
  }

  try {
    const input = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const amount = Number(input.amount);
    const startTime = Number(input.startTime);
    if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(startTime) || startTime <= 0) {
      return json(res, { message: 'Data pembayaran tidak valid.' }, 400);
    }

    const gatewayResponse = await fetch(`${gatewayUrl}/check-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify({ amount, startTime })
    });
    const gateway = await gatewayResponse.json().catch(() => ({}));
    if (!gatewayResponse.ok || gateway.success === false) {
      return json(res, { message: gateway.message || gateway.error || `Gateway error (${gatewayResponse.status})` }, 502);
    }

    return json(res, {
      status: gateway.paid ? 'PAID' : 'PENDING',
      paid: !!gateway.paid,
      transaction: gateway.transaction || null
    });
  } catch (error) {
    return json(res, { message: error?.message || 'Internal error' }, 500);
  }
};
