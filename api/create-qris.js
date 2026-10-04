export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const gateway = process.env.PAYMENT_GATEWAY_URL;
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY;

    if (!gateway || !apiKey) {
      return res.status(500).json({
        error: 'Payment gateway belum dikonfigurasi.'
      });
    }

    const amount = Number(req.body?.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        error: 'Nominal pembayaran tidak valid.'
      });
    }

    const response = await fetch(`${gateway}/create-qris`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify({ amount })
    });

    const data = await response.json();

    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Gagal menghubungi payment gateway.'
    });
  }
}
