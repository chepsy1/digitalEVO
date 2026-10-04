export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const gateway = String(process.env.PAYMENT_GATEWAY_URL || '').replace(/\/+$/, '');
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.API_KEY;
    if (!gateway || !apiKey) return res.status(500).json({ error: 'Payment gateway belum dikonfigurasi.' });

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Nominal pembayaran tidak valid.' });

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
    const transactionId = d?.paymentId || d?.payment_id || d?.transactionId || d?.transaction_id || d?.id;
    const finalAmount = Number(d?.amount || data?.amount || amount);

    if (!qrisUrl && !d?.qrContent && !d?.qr_content && !d?.qrImage && !d?.qr_image) {
      return res.status(502).json({ error: 'Gateway tidak mengembalikan QRIS.', details: data });
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
