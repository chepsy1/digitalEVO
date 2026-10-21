(() => {
  const tabs = [...document.querySelectorAll(".tab")];
  const views = { login: document.getElementById("login-view"), register: document.getElementById("register-view") };
  const notice = document.getElementById("notice");
  const dashboard = document.getElementById("member-dashboard");
  const paymentPanel = document.getElementById("payment-panel");
  const registrationAction = document.getElementById("registration-action");
  const depositForm = document.getElementById("deposit-form");
  let client = null;
  let activePaymentReference = null;

  const rupiah = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
  const normalizePhone = value => {
    let phone = String(value || "").replace(/[\s().-]/g, "");
    if (phone.startsWith("00")) phone = "+" + phone.slice(2);
    else if (phone.startsWith("0")) phone = "+62" + phone.slice(1);
    else if (phone.startsWith("62")) phone = "+" + phone;
    else if (!phone.startsWith("+")) phone = "+62" + phone;
    return phone;
  };
  const setNotice = (message, isError = false) => {
    notice.textContent = message;
    notice.classList.toggle("error", isError);
  };
  const accessToken = async () => {
    const { data } = await client.auth.getSession();
    return data.session?.access_token || null;
  };
  async function api(action, payload = {}) {
    const token = await accessToken();
    if (!token) throw new Error("Sesi login tidak ditemukan. Silakan login kembali.");
    const response = await fetch("/api/member-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Permintaan gagal diproses.");
    return data;
  }
  function switchView(name) {
    const showRegister = name === "register";
    views.login.hidden = showRegister;
    views.register.hidden = !showRegister;
    tabs.forEach(tab => {
      const active = tab.id === (showRegister ? "register-tab" : "login-tab");
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
  }
  tabs.forEach(tab => tab.addEventListener("click", () => switchView(tab.id === "register-tab" ? "register" : "login")));
  document.querySelectorAll("[data-switch]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.switch)));

  async function showPayment(payment) {
    activePaymentReference = payment.paymentReference;
    paymentPanel.hidden = false;
    document.getElementById("payment-title").textContent = payment.type === "registration" ? "Pembayaran Pendaftaran Member" : "Pembayaran Deposit";
    document.getElementById("payment-description").textContent = "Nominal: " + rupiah(payment.amount) + ". Saldo baru diproses setelah pembayaran diverifikasi server.";
    document.getElementById("payment-reference").textContent = "Referensi pembayaran: " + payment.paymentReference;
    const image = document.getElementById("payment-qr-image");
    const canvas = document.getElementById("payment-qr-canvas");
    const imageUrl = payment.qrisUrl || payment.qrImage || "";
    canvas.hidden = true;
    if (imageUrl && /^(https?:\/\/|data:image\/)/i.test(imageUrl)) {
      image.src = imageUrl;
      image.hidden = false;
    } else {
      image.removeAttribute("src");
      image.hidden = true;
    }
    const qrContent = document.getElementById("payment-qr-content");
    qrContent.textContent = payment.qrContent || "";
    qrContent.hidden = !payment.qrContent;
    if (payment.qrContent && window.QRCode?.toCanvas) {
      try {
        await window.QRCode.toCanvas(canvas, payment.qrContent, { width: 280, margin: 2 });
        canvas.hidden = false;
        image.hidden = true;
        qrContent.hidden = true;
      } catch (error) {
        console.error("QRIS canvas gagal dibuat:", error);
      }
    }
    const link = document.getElementById("payment-open-link");
    if (payment.qrisUrl && /^https?:\/\//i.test(payment.qrisUrl)) {
      link.href = payment.qrisUrl;
      link.hidden = false;
    } else {
      link.removeAttribute("href");
      link.hidden = true;
    }
    paymentPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function refreshStatus() {
    const result = await api("status");
    const profile = result.profile;
    dashboard.hidden = false;
    document.getElementById("wallet-balance").textContent = rupiah(result.balance);
    document.getElementById("member-phone-label").textContent = profile?.whatsapp || "";
    const active = profile?.status === "active";
    document.getElementById("member-status-title").textContent = active ? "Member aktif" : "Menunggu pendaftaran";
    registrationAction.hidden = active;
    depositForm.hidden = !active;
    return result;
  }

  async function createRegistration() {
    setNotice("Menyiapkan QRIS pendaftaran...");
    const payment = await api("create_registration");
    await showPayment(payment);
    setNotice("QRIS pendaftaran berhasil dibuat. Bayar sesuai nominal, lalu tekan Periksa Pembayaran.");
  }

  document.getElementById("register-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!client) return setNotice("Layanan autentikasi belum siap. Muat ulang halaman.", true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirmPassword") || "");
    if (password !== confirm) return setNotice("Konfirmasi password tidak sama.", true);
    if (password.length < 8) return setNotice("Password minimal 8 karakter.", true);
    const phone = normalizePhone(form.get("phone"));
    setNotice("Membuat akun member...");
    try {
      const { data, error } = await client.auth.signUp({ phone, password });
      if (error) throw error;
      if (!data.session) {
        setNotice("Akun dibuat, tetapi Supabase meminta verifikasi nomor WhatsApp/OTP. Setelah verifikasi, login lalu lanjutkan pembayaran. Untuk login hanya dengan nomor dan password, pengaturan Phone confirmations Supabase perlu disesuaikan.");
        return;
      }
      await refreshStatus();
      await createRegistration();
    } catch (error) {
      setNotice(error.message || "Pendaftaran gagal.", true);
    }
  });

  document.getElementById("login-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!client) return setNotice("Layanan autentikasi belum siap. Muat ulang halaman.", true);
    const form = new FormData(event.currentTarget);
    setNotice("Memeriksa akun...");
    try {
      const { error } = await client.auth.signInWithPassword({
        phone: normalizePhone(form.get("phone")),
        password: String(form.get("password") || "")
      });
      if (error) throw error;
      await refreshStatus();
      setNotice("Login berhasil.");
    } catch (error) {
      setNotice(error.message || "Login gagal. Periksa nomor dan password.", true);
    }
  });

  document.getElementById("registration-pay-button").addEventListener("click", async () => {
    try { await createRegistration(); } catch (error) { setNotice(error.message, true); }
  });

  depositForm.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const amount = Number(new FormData(depositForm).get("amount"));
      setNotice("Menyiapkan QRIS deposit...");
      const payment = await api("create_deposit", { amount });
      showPayment(payment);
      setNotice("QRIS deposit berhasil dibuat. Bayar sesuai nominal, lalu periksa pembayaran.");
    } catch (error) {
      setNotice(error.message || "Gagal membuat deposit.", true);
    }
  });

  document.getElementById("check-payment-button").addEventListener("click", async () => {
    if (!activePaymentReference) return setNotice("Tidak ada pembayaran yang sedang diperiksa.", true);
    const button = document.getElementById("check-payment-button");
    button.disabled = true;
    button.textContent = "Memeriksa...";
    try {
      const result = await api("check", { paymentReference: activePaymentReference });
      if (!result.paid) {
        setNotice(result.message || "Pembayaran belum terdeteksi. Jika baru membayar, tunggu sebentar lalu coba lagi.");
      } else {
        setNotice(result.type === "registration" ? "Pembayaran terverifikasi. Member aktif dan bonus saldo diproses." : "Deposit terverifikasi dan saldo berhasil diperbarui.");
        await refreshStatus();
        paymentPanel.hidden = true;
        activePaymentReference = null;
      }
    } catch (error) {
      setNotice(error.message || "Gagal memeriksa pembayaran.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Periksa Pembayaran";
    }
  });

  document.getElementById("logout-button").addEventListener("click", async () => {
    if (client) await client.auth.signOut();
    dashboard.hidden = true;
    paymentPanel.hidden = true;
    activePaymentReference = null;
    setNotice("Anda sudah keluar dari akun member.");
    switchView("login");
  });

  function init() {
    const config = window.SUPABASE_CONFIG;
    if (!window.supabase?.createClient || !config?.url || !config?.anonKey) {
      setNotice("Konfigurasi Supabase belum tersedia. Silakan muat ulang atau hubungi admin.", true);
      return;
    }
    client = window.supabase.createClient(config.url, config.anonKey);
    client.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        try { await refreshStatus(); } catch (error) { setNotice(error.message, true); }
      }
    });
  }
  init();
})();
