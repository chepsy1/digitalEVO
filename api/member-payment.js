import { createHmac } from 'node:crypto';

function reply(res, status, body) {
  return res.status(status).json(body);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function db(path, options = {}) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!base || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase server belum dikonfigurasi.');
  return fetch(`${base}${path}`, { ...options, headers: { ...serviceHeaders(), ...(options.headers || {}) } });
}

async function currentUser(req) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const authorization = String(req.headers.authorization || '');
  if (!base || !anonKey || !authorization.startsWith('Bearer ')) return null;
  const response = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization }
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id && UUID_RE.test(user.id) ? user : null;
}

async function createGatewayQris(amount) {
  const gateway = String(process.env.PAYMENT_GATEWAY_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.API_KEY;
  if (!gateway || !apiKey) throw new Error('Payment gateway belum dikonfigurasi.');

  const response = await fetch(`${gateway}/create-qris`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ amount })
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(data?.error || data?.message || 'Gagal membuat QRIS.');
  const d = data?.data || data?.result || data;
  const qrisUrl = d?.qris_url || d?.qr_url || d?.qrUrl || d?.qrImageUrl || data?.qris_url || data?.qr_url;
  const paymentReference = d?.paymentId || d?.payment_id || d?.transactionId || d?.transaction_id ||
    d?.partnerReferenceNo || d?.partner_reference_no || d?.referenceNo || d?.reference_no || d?.id ||
    (qrisUrl ? String(qrisUrl).split('?')[0].split('/').filter(Boolean).pop() : null);
  const qrContent = d?.qrContent || d?.qr_content || null;
  const qrImage = d?.qrImage || d?.qr_image || null;
  if (!paymentReference || (!qrisUrl && !qrContent && !qrImage)) throw new Error('Gateway tidak mengembalikan data QRIS yang lengkap.');
  const rawExpiry = d?.expires_at || d?.expiresAt || data?.expires_at || null;
  let expiresAt = null;
  if (rawExpiry) {
    const rawText = String(rawExpiry).trim();
    const numericExpiry = /^\d{10,13}$/.test(rawText) ? Number(rawText) : null;
    const expiryDate = numericExpiry !== null
      ? new Date(numericExpiry < 1000000000000 ? numericExpiry * 1000 : numericExpiry)
      : new Date(rawExpiry);
    if (!Number.isNaN(expiryDate.getTime())) expiresAt = expiryDate.toISOString();
  }
  return { paymentReference: String(paymentReference), qrisUrl, qrContent, qrImage, expiresAt };
}

async function gatewayPaymentStatus(paymentReference, amount, startTime) {
  const gateway = String(process.env.PAYMENT_GATEWAY_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.API_KEY;
  const response = await fetch(`${gateway}/check-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ paymentId: paymentReference, amount, startTime: Number(startTime) || Math.floor(Date.now() / 1000) })
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(data?.error || data?.message || 'Gagal memeriksa pembayaran.');
  const d = data?.data || data?.result || data;
  const status = String(d?.status || data?.status || '').toUpperCase();
  const paid = d?.paid === true || data?.paid === true || ['PAID', 'SUCCESS', 'SUCCEEDED', 'COMPLETED', 'SETTLED'].includes(status);
  const gatewayAmount = Number(d?.amount ?? d?.transaction?.amount ?? data?.amount ?? data?.transaction?.amount ?? 0);
  if (paid && (!Number.isSafeInteger(gatewayAmount) || gatewayAmount !== amount)) {
    throw new Error('Nominal pembayaran tidak sesuai. Pembayaran belum dikreditkan; hubungi admin untuk pemeriksaan.');
  }
  return paid;
}


function normalizedMemberPhone(value) {
  let phone = String(value || '').replace(/[\s().-]/g, '');
  if (phone.startsWith('00')) phone = '+' + phone.slice(2);
  else if (phone.startsWith('0')) phone = '+62' + phone.slice(1);
  else if (phone.startsWith('62')) phone = '+' + phone;
  else if (!phone.startsWith('+')) phone = '+62' + phone;
  return phone;
}

function memberInternalEmail(phone) {
  return phone.replace(/\D/g, '') + '@members.digitalevo.store';
}

function memberRateLimitHash(value) {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY)
    .update(String(value || 'unknown'))
    .digest('hex');
}

async function checkMemberAuthRateLimit(action, phone, req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || String(req.headers['x-real-ip'] || '').trim() || 'unknown';
  const response = await db('/rest/v1/rpc/member_auth_rate_limit', {
    method: 'POST',
    body: JSON.stringify({
      p_action: action,
      p_phone_hash: memberRateLimitHash(phone),
      p_ip_hash: memberRateLimitHash(ip)
    })
  });
  if (!response.ok) {
    console.error('Member auth rate limit check failed:', response.status, await response.text());
    throw new Error('Pemeriksaan keamanan login sedang tidak tersedia. Coba lagi nanti.');
  }
  return await response.json();
}

async function memberAuthAction(req, res, action) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!base || !serviceKey || !anonKey) {
    reply(res, 500, { error: 'Konfigurasi autentikasi member belum lengkap.' });
    return true;
  }

  const phone = normalizedMemberPhone(req.body?.phone);
  const password = String(req.body?.password || '');
  if (!/^\+628[0-9]{7,12}$/.test(phone)) {
    reply(res, 400, { error: 'Nomor WhatsApp Indonesia tidak valid. Gunakan format 08xxxxxxxxxx.' });
    return true;
  }
  if (password.length < 8 || password.length > 128) {
    reply(res, 400, { error: 'Password harus terdiri dari 8 sampai 128 karakter.' });
    return true;
  }

  const allowed = await checkMemberAuthRateLimit(action, phone, req);
  if (allowed !== true) {
    reply(res, 429, {
      error: action === 'register'
        ? 'Percobaan pendaftaran terlalu sering. Coba lagi setelah satu jam.'
        : 'Percobaan login terlalu sering. Coba lagi dalam 15 menit.'
    });
    return true;
  }

  const email = memberInternalEmail(phone);
  if (action === 'register') {
    const createResponse = await fetch(`${base}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { whatsapp: phone, auth_method: 'digitalevo_whatsapp_password' }
      })
    });
    if (!createResponse.ok) {
      const detail = await createResponse.json().catch(() => ({}));
      const message = String(detail?.msg || detail?.message || detail?.error_description || '');
      if (createResponse.status === 422 || /already|registered|exists|duplicate/i.test(message)) {
        reply(res, 409, { error: 'Nomor WhatsApp ini sudah terdaftar. Silakan masuk melalui tab Login.' });
      } else {
        console.error('Member account creation failed:', createResponse.status, message);
        reply(res, 502, { error: 'Akun member belum berhasil dibuat. Tunggu sebentar lalu coba sekali lagi.' });
      }
      return true;
    }
  }

  const tokenResponse = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData?.access_token || !tokenData?.refresh_token) {
    reply(res, tokenResponse.status === 400 || tokenResponse.status === 401 ? 401 : 502, {
      error: action === 'login'
        ? 'Nomor WhatsApp atau password tidak cocok.'
        : 'Akun dibuat, tetapi sesi belum terbentuk. Coba masuk melalui tab Login.'
    });
    return true;
  }

  reply(res, 200, {
    success: true,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_in: tokenData.expires_in,
    token_type: tokenData.token_type || 'bearer'
  });
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed' });

  try {
    const action = String(req.body?.action || '');
    if (action === 'register' || action === 'login') return await memberAuthAction(req, res, action);
    const user = await currentUser(req);
    if (!user) return reply(res, 401, { error: 'Silakan login sebagai member terlebih dahulu.' });
    const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    if (!base || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_ANON_KEY) {
      return reply(res, 500, { error: 'Konfigurasi server member belum lengkap.' });
    }

    if (action === 'status') {
      const profileResponse = await db(`/rest/v1/member_profiles?user_id=eq.${encodeURIComponent(user.id)}&select=whatsapp,status,activated_at&limit=1`);
      const profiles = await profileResponse.json();
      if (!profileResponse.ok) return reply(res, 500, { error: 'Gagal membaca profil member.' });
      const walletResponse = await db(`/rest/v1/member_wallets?user_id=eq.${encodeURIComponent(user.id)}&select=balance&limit=1`);
      const wallets = await walletResponse.json();
      if (!walletResponse.ok) return reply(res, 500, { error: 'Gagal membaca saldo member.' });
      return reply(res, 200, {
        success: true,
        profile: profiles?.[0] || null,
        balance: Number(wallets?.[0]?.balance || 0)
      });
    }

    if (action === 'resume_pending') {
      const regResponse = await db(
        `/rest/v1/member_registration_payments?user_id=eq.${encodeURIComponent(user.id)}&payment_status=eq.pending&select=amount,payment_reference,qris_url,qr_content,qr_image,expires_at,created_at,gateway_start_time&order=created_at.desc&limit=1`
      );
      const registrations = await regResponse.json();
      if (!regResponse.ok) return reply(res, 500, { error: 'Gagal memulihkan pembayaran pendaftaran.' });

      const depResponse = await db(
        `/rest/v1/member_deposit_requests?user_id=eq.${encodeURIComponent(user.id)}&payment_status=eq.pending&select=amount,payment_reference,qris_url,qr_content,qr_image,expires_at,created_at,gateway_start_time&order=created_at.desc&limit=1`
      );
      const deposits = await depResponse.json();
      if (!depResponse.ok) return reply(res, 500, { error: 'Gagal memulihkan pembayaran deposit.' });

      const reg = registrations?.[0] ? { ...registrations[0], type: 'registration' } : null;
      const dep = deposits?.[0] ? { ...deposits[0], type: 'deposit' } : null;
      const pending = !reg ? dep : !dep ? reg :
        new Date(reg.created_at).getTime() >= new Date(dep.created_at).getTime() ? reg : dep;
      if (!pending) return reply(res, 200, { success: true, pending: null });
      const isExpired = pending.expires_at && new Date(pending.expires_at).getTime() <= Date.now();
      if (isExpired) {
        // QRIS expiry alone is not proof that the payment failed. Verify with the gateway first.
        const paid = await gatewayPaymentStatus(
          pending.payment_reference,
          Number(pending.amount),
          Number(pending.gateway_start_time) || Math.floor(new Date(pending.created_at).getTime() / 1000)
        );
        const table = pending.type === 'registration' ? 'member_registration_payments' : 'member_deposit_requests';
        if (paid) {
          const update = await db(
            `/rest/v1/${table}?user_id=eq.${encodeURIComponent(user.id)}&payment_reference=eq.${encodeURIComponent(pending.payment_reference)}&payment_status=eq.pending`,
            { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ payment_status: 'paid', paid_at: new Date().toISOString() }) }
          );
          if (!update.ok) return reply(res, 500, { error: 'Pembayaran terdeteksi lunas tetapi belum bisa disimpan. Coba periksa pembayaran kembali.' });
          const rpc = pending.type === 'registration' ? 'member_activate_after_verified_registration' : 'member_credit_verified_deposit';
          const credit = await db(`/rest/v1/rpc/${rpc}`, {
            method: 'POST',
            body: JSON.stringify({ p_user_id: user.id, p_payment_reference: pending.payment_reference })
          });
          if (!credit.ok) return reply(res, 500, { error: 'Pembayaran sudah terverifikasi, tetapi aktivasi/saldo belum selesai. Tekan Periksa Pembayaran kembali.' });
          return reply(res, 200, { success: true, pending: null, paid: true, type: pending.type });
        }
        const expireResponse = await db(
          `/rest/v1/${table}?user_id=eq.${encodeURIComponent(user.id)}&payment_reference=eq.${encodeURIComponent(pending.payment_reference)}&payment_status=eq.pending`,
          { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ payment_status: 'expired' }) }
        );
        if (!expireResponse.ok) return reply(res, 500, { error: 'Pembayaran lama belum bisa ditutup. Silakan coba lagi.' });
        return reply(res, 200, { success: true, pending: null, expired: true });
      }
      return reply(res, 200, {
        success: true,
        pending: {
          type: pending.type,
          amount: Number(pending.amount),
          paymentReference: pending.payment_reference,
          qrisUrl: pending.qris_url,
          qrContent: pending.qr_content,
          qrImage: pending.qr_image,
          expiresAt: pending.expires_at
        }
      });
    }

    // Create a pending member profile for a verified Supabase Auth identity.
    if (action === 'create_registration') {
      const phone = String(user.phone || user.user_metadata?.whatsapp || '');
      if (!/^\+628[0-9]{7,12}$/.test(phone)) return reply(res, 400, { error: 'Profil akun tidak memiliki nomor WhatsApp yang valid.' });
      const existingProfileResponse = await db(`/rest/v1/member_profiles?user_id=eq.${encodeURIComponent(user.id)}&select=status&limit=1`);
      const existingProfiles = await existingProfileResponse.json();
      if (!existingProfileResponse.ok) return reply(res, 500, { error: 'Gagal memeriksa status member.' });
      if (existingProfiles?.[0]?.status === 'active') return reply(res, 409, { error: 'Keanggotaan Anda sudah aktif. Anda tidak perlu membayar pendaftaran lagi.' });

      const pendingResponse = await db(`/rest/v1/member_registration_payments?user_id=eq.${encodeURIComponent(user.id)}&payment_status=eq.pending&select=amount,payment_reference,qris_url,qr_content,qr_image,expires_at,created_at,gateway_start_time&order=created_at.desc&limit=1`);
      const pendingPayments = await pendingResponse.json();
      if (!pendingResponse.ok) return reply(res, 500, { error: 'Gagal memeriksa pembayaran pendaftaran.' });
      if (pendingPayments?.[0]) {
        const pending = pendingPayments[0];
        const expired = pending.expires_at && new Date(pending.expires_at).getTime() <= Date.now();
        if (expired) {
          const expireResponse = await db(
            `/rest/v1/member_registration_payments?user_id=eq.${encodeURIComponent(user.id)}&payment_reference=eq.${encodeURIComponent(pending.payment_reference)}&payment_status=eq.pending`,
            { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ payment_status: 'expired' }) }
          );
          if (!expireResponse.ok) return reply(res, 500, { error: 'Pembayaran pendaftaran lama belum bisa ditutup. Silakan coba lagi.' });
        } else {
          return reply(res, 200, {
            success: true, type: 'registration', amount: Number(pending.amount),
            paymentReference: pending.payment_reference, qrisUrl: pending.qris_url,
            qrContent: pending.qr_content, qrImage: pending.qr_image, expiresAt: pending.expires_at,
            resumed: true
          });
        }
      }

      const profileResponse = await db('/rest/v1/member_profiles?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ user_id: user.id, whatsapp: phone, status: 'pending_payment', updated_at: new Date().toISOString() })
      });
      const profileText = await profileResponse.text();
      if (!profileResponse.ok) return reply(res, 409, { error: 'Profil member belum bisa disiapkan. Pastikan nomor WhatsApp belum dipakai akun lain.', details: profileText });

      // Capture the gateway search window before QR creation so fast payments are not missed.
      const gatewayStartTime = Math.floor(Date.now() / 1000);
      const payment = await createGatewayQris(99000);
      const saved = await db('/rest/v1/member_registration_payments', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: user.id, amount: 99000, payment_reference: payment.paymentReference,
          payment_status: 'pending', gateway_start_time: gatewayStartTime,
          qris_url: payment.qrisUrl, qr_content: payment.qrContent,
          qr_image: payment.qrImage, expires_at: payment.expiresAt
        })
      });
      if (!saved.ok) {
        console.error('QRIS pendaftaran dibuat tetapi referensi gagal disimpan:', await saved.text());
        return reply(res, 502, { error: 'QRIS dibuat tetapi data pembayaran belum tersimpan. Jangan bayar dulu; hubungi admin.' });
      }
      return reply(res, 200, { success: true, type: 'registration', amount: 99000, ...payment });
    }

    if (action === 'create_deposit') {
      const amount = Number(req.body?.amount);
      if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 10000000) {
        return reply(res, 400, { error: 'Nominal deposit harus Rp1.000 sampai Rp10.000.000.' });
      }
      const profileResponse = await db(`/rest/v1/member_profiles?user_id=eq.${encodeURIComponent(user.id)}&select=status&limit=1`);
      const profiles = await profileResponse.json();
      if (!profileResponse.ok || !profiles?.[0] || profiles[0].status !== 'active') {
        return reply(res, 403, { error: 'Deposit hanya tersedia untuk member aktif.' });
      }
      const pendingResponse = await db(
        `/rest/v1/member_deposit_requests?user_id=eq.${encodeURIComponent(user.id)}&payment_status=eq.pending&select=amount,payment_reference,qris_url,qr_content,qr_image,expires_at,created_at,gateway_start_time&order=created_at.desc&limit=1`
      );
      const pendingRows = await pendingResponse.json();
      if (!pendingResponse.ok) return reply(res, 500, { error: 'Gagal memeriksa deposit yang masih menunggu.' });
      const pending = pendingRows?.[0];
      if (pending) {
        const expired = pending.expires_at && new Date(pending.expires_at).getTime() <= Date.now();
        if (expired) {
          const expiredResponse = await db(
            `/rest/v1/member_deposit_requests?user_id=eq.${encodeURIComponent(user.id)}&payment_reference=eq.${encodeURIComponent(pending.payment_reference)}&payment_status=eq.pending`,
            { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ payment_status: 'expired' }) }
          );
          if (!expiredResponse.ok) return reply(res, 500, { error: 'Deposit lama belum bisa ditutup. Silakan coba lagi.' });
        } else {
          return reply(res, 200, {
            success: true, type: 'deposit', amount: Number(pending.amount),
            paymentReference: pending.payment_reference, qrisUrl: pending.qris_url,
            qrContent: pending.qr_content, qrImage: pending.qr_image,
            expiresAt: pending.expires_at, resumed: true
          });
        }
      }

      // Capture the gateway search window before QR creation so fast payments are not missed.
      const gatewayStartTime = Math.floor(Date.now() / 1000);
      const payment = await createGatewayQris(amount);
      const saved = await db('/rest/v1/member_deposit_requests', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: user.id, amount, payment_reference: payment.paymentReference,
          payment_status: 'pending', gateway_start_time: gatewayStartTime,
          qris_url: payment.qrisUrl, qr_content: payment.qrContent,
          qr_image: payment.qrImage, expires_at: payment.expiresAt
        })
      });
      if (!saved.ok) {
        console.error('QRIS deposit dibuat tetapi referensi gagal disimpan:', await saved.text());
        return reply(res, 502, { error: 'QRIS dibuat tetapi data deposit belum tersimpan. Jangan bayar dulu; hubungi admin.' });
      }
      return reply(res, 200, { success: true, type: 'deposit', amount, ...payment });
    }

    if (action === 'check') {
      const paymentReference = String(req.body?.paymentReference || '').trim();
      if (!paymentReference || paymentReference.length > 200) return reply(res, 400, { error: 'Referensi pembayaran tidak valid.' });

      const regResponse = await db(`/rest/v1/member_registration_payments?user_id=eq.${encodeURIComponent(user.id)}&payment_reference=eq.${encodeURIComponent(paymentReference)}&select=id,amount,payment_status,created_at,gateway_start_time&limit=1`);
      const registrations = await regResponse.json();
      if (!regResponse.ok) return reply(res, 500, { error: 'Gagal membaca pembayaran pendaftaran.' });
      const depResponse = await db(`/rest/v1/member_deposit_requests?user_id=eq.${encodeURIComponent(user.id)}&payment_reference=eq.${encodeURIComponent(paymentReference)}&select=id,amount,payment_status,created_at,gateway_start_time&limit=1`);
      const deposits = await depResponse.json();
      if (!depResponse.ok) return reply(res, 500, { error: 'Gagal membaca pembayaran deposit.' });

      const type = registrations?.[0] ? 'registration' : deposits?.[0] ? 'deposit' : null;
      const record = registrations?.[0] || deposits?.[0];
      if (!record) return reply(res, 404, { error: 'Pembayaran tidak ditemukan untuk akun ini.' });
      if (record.payment_status !== 'paid') {
        const paid = await gatewayPaymentStatus(paymentReference, Number(record.amount), Number(record.gateway_start_time) || Math.floor(new Date(record.created_at).getTime() / 1000));
        if (!paid) return reply(res, 200, { success: true, paid: false, type, message: 'Pembayaran belum terdeteksi.' });

        const table = type === 'registration' ? 'member_registration_payments' : 'member_deposit_requests';
        const update = await db(`/rest/v1/${table}?id=eq.${encodeURIComponent(record.id)}&user_id=eq.${encodeURIComponent(user.id)}&payment_status=eq.pending`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ payment_status: 'paid', paid_at: new Date().toISOString() })
        });
        const updatedText = await update.text();
        if (!update.ok) return reply(res, 500, { error: 'Pembayaran terdeteksi tetapi gagal disimpan. Silakan coba periksa lagi.', details: updatedText });
      }

      // Retry the idempotent credit/activation RPC even if the payment row was marked paid
      // by a previous request that failed midway.
      const rpc = type === 'registration' ? 'member_activate_after_verified_registration' : 'member_credit_verified_deposit';
      const rpcResponse = await db(`/rest/v1/rpc/${rpc}`, {
        method: 'POST',
        body: JSON.stringify({ p_user_id: user.id, p_payment_reference: paymentReference })
      });
      const rpcText = await rpcResponse.text();
      if (!rpcResponse.ok) return reply(res, 500, { error: 'Pembayaran sudah terverifikasi tetapi saldo belum berhasil diproses. Silakan tekan periksa pembayaran kembali atau hubungi admin.', details: rpcText });
      return reply(res, 200, { success: true, paid: true, type, balance: type === 'deposit' ? Number(rpcText) : 15000 });
    }

    return reply(res, 400, { error: 'Aksi member tidak dikenal.' });
  } catch (error) {
    return reply(res, 502, { error: error?.message || 'Terjadi kesalahan pada layanan member.' });
  }
}
