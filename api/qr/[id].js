export default async function handler(req, res) {
  try {
    const gateway = process.env.PAYMENT_GATEWAY_URL;

    if (!gateway) {
      return res.status(500).send('Payment gateway belum dikonfigurasi.');
    }

    const id = req.query.id;

    if (!id) {
      return res.status(400).send('QR ID tidak ditemukan.');
    }

    const response = await fetch(
      `${gateway}/qr/${encodeURIComponent(id)}`,
      {
        headers: {
          'Accept': 'text/html,image/png,image/jpeg,image/*,*/*'
        }
      }
    );

    const contentType =
      response.headers.get('content-type') || 'text/html';

    const body = await response.arrayBuffer();

    res.status(response.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    return res.send(Buffer.from(body));
  } catch (error) {
    return res.status(500).send(
      error.message || 'Gagal mengambil QRIS dari gateway.'
    );
  }
}
