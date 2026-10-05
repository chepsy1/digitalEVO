export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const gateway = process.env.PAYMENT_GATEWAY_URL;
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY;

    if (!gateway || !apiKey) {
      return res.status(500).json({ success: false, error: 'Gateway belum dikonfigurasi' });
    }

    const response = await fetch(`${gateway}/api/notify-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(req.body || {})
    });

    const data = await response.json();

    return res.status(response.status).json(data);
  } catch {
    return res.status(500).json({
      success: false,
      error: 'Gagal mengirim notifikasi pesanan'
    });
  }
}
