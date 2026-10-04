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

    const response = await fetch(`${gateway}/check-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Gagal menghubungi payment gateway.'
    });
  }
}
