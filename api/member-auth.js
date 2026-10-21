function reply(res, status, body) { return res.status(status).json(body); }

const PHONE_RE = /^\\+628[0-9]{7,11}$/;

function normalizePhone(value) {
  let phone = String(value || "").replace(/[\\s().-]/g, "");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  else if (phone.startsWith("0")) phone = "+62" + phone.slice(1);
  else if (phone.startsWith("62")) phone = "+" + phone;
  else if (!phone.startsWith("+")) phone = "+62" + phone;
  return phone;
}

function internalEmail(phone) {
  return phone.replace(/\\D/g, "") + "@members.digitalevo.invalid";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return reply(res, 405, { error: "Method not allowed" });

  const base = String(process.env.SUPABASE_URL || "").replace(/\\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !serviceKey) return reply(res, 500, { error: "Konfigurasi server member belum lengkap." });

  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || "");
  if (!PHONE_RE.test(phone)) return reply(res, 400, { error: "Nomor WhatsApp Indonesia tidak valid. Gunakan nomor aktif dengan format 08xxxxxxxxxx." });
  if (password.length < 8 || password.length > 72) return reply(res, 400, { error: "Password harus terdiri dari 8–72 karakter." });

  // A synthetic, non-deliverable email lets Supabase Email Auth handle passwords
  // without sending OTP/email. No email is collected from the customer.
  const email = internalEmail(phone);

  try {
    const response = await fetch(`${base}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { whatsapp: phone, auth_method: "digitalevo_whatsapp_password" }
      })
    });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }

    if (!response.ok) {
      if (response.status === 422 || /already been registered|already exists|duplicate/i.test(String(data.msg || data.message || data.error || ""))) {
        return reply(res, 409, { error: "Nomor WhatsApp ini sudah terdaftar. Silakan login atau hubungi admin jika Anda belum pernah membuat akun." });
      }
      console.error("Pembuatan akun member gagal:", response.status);
      return reply(res, 502, { error: "Akun member belum dapat dibuat. Periksa konfigurasi Auth staging lalu coba lagi." });
    }

    return reply(res, 201, { success: true, phone, message: "Akun berhasil dibuat. Silakan masuk menggunakan nomor WhatsApp dan password." });
  } catch (error) {
    console.error("member-auth error:", error?.message || error);
    return reply(res, 502, { error: "Layanan pendaftaran member sementara tidak tersedia." });
  }
}
