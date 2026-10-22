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
  let memberProducts = [];

  const rupiah = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
  const normalizePhone = value => {
    let phone = String(value || "").replace(/[\s().-]/g, "");
    if (phone.startsWith("00")) phone = "+" + phone.slice(2);
    else if (phone.startsWith("0")) phone = "+62" + phone.slice(1);
    else if (phone.startsWith("62")) phone = "+" + phone;
    else if (!phone.startsWith("+")) phone = "+62" + phone;
    return phone;
  };
  // Internal non-deliverable email lets Supabase manage passwords without Phone OTP.
  const internalEmail = value => normalizePhone(value).replace(/\D/g, "") + "@members.digitalevo.store";
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


  const categoryLabels = {
    followers: "Shopee Followers", account: "Akun Shopee",
    video_views: "Shopee Video Views", video_likes: "Shopee Video Likes",
    video_comments: "Shopee Video Custom Comments", product_likes: "Shopee Produk Favorite/Likes"
  };
  function renderOrderFields(category) {
    const host = document.getElementById("wallet-order-fields");
    host.replaceChildren();
    const addField = (id, label, type = "text", required = true, placeholder = "") => {
      const wrap = document.createElement("div");
      const elLabel = document.createElement("label");
      elLabel.htmlFor = id; elLabel.textContent = label;
      const input = document.createElement(type === "textarea" ? "textarea" : "input");
      input.id = id; input.name = id; input.required = required; input.placeholder = placeholder;
      if (type === "textarea") input.rows = 5;
      else input.type = type;
      wrap.append(elLabel, input); host.append(wrap);
    };
    if (category === "account") {
      addField("member-account-name", "Nama akun/paket yang dipesan");
      addField("member-account-contact", "Kontak penerima / WhatsApp");
    } else {
      addField("member-customer-whatsapp", "Nomor WhatsApp");
      addField("member-shopee-link", category === "product_likes" ? "Link produk Shopee" : "Link video / username Shopee", "text", true, "Tempel link atau username");
      if (category === "video_comments") addField("member-comment-text", "Komentar (satu komentar per baris)", "textarea", true, "Tulis komentar sesuai jumlah paket");
      if (category === "followers") addField("member-account-photo", "Foto / screenshot akun Shopee (JPG, PNG, WEBP)", "file", true);
    }
  }
  async function loadMemberProducts() {
    const select = document.getElementById("wallet-product");
    select.replaceChildren(new Option("Memuat produk...", ""));
    try {
      const { data, error } = await client.from("products")
        .select("id,category,qty,price,member_price,sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      memberProducts = (data || []).filter(p => categoryLabels[p.category] && Number(p.qty) > 0 && Number(p.price) >= 0);
      select.replaceChildren(new Option("Pilih produk dan paket", ""));
      for (const p of memberProducts) {
        const price = p.member_price == null ? Number(p.price) : Number(p.member_price);
        const opt = new Option(categoryLabels[p.category] + " — " + Number(p.qty).toLocaleString("id-ID") + " — " + rupiah(price), String(p.id));
        select.add(opt);
      }
      if (!memberProducts.length) select.replaceChildren(new Option("Produk belum tersedia", ""));
      select.addEventListener("change", () => {
        const p = memberProducts.find(x => String(x.id) === select.value);
        document.getElementById("wallet-price").textContent = p ? "Harga member: " + rupiah(p.member_price == null ? p.price : p.member_price) : "Pilih produk untuk melihat harga.";
        renderOrderFields(p?.category || "");
      });
    } catch (error) {
      select.replaceChildren(new Option("Produk belum dapat dimuat", ""));
      setNotice("Daftar produk member belum tersedia. Pastikan migrasi member dan kolom harga member sudah diterapkan.", true);
    }
  }
  document.getElementById("wallet-checkout-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
    const resultBox = document.getElementById("wallet-order-result");
    const product = memberProducts.find(p => String(p.id) === document.getElementById("wallet-product").value);
    if (!product) return setNotice("Silakan pilih produk yang valid.", true);
    const category = product.category;
    const value = id => document.getElementById(id)?.value?.trim() || "";
    const order = {};
    if (category === "account") {
      order.accountName = value("member-account-name");
      order.accountContact = value("member-account-contact");
    } else {
      order.customerWhatsapp = value("member-customer-whatsapp");
      order.shopeeLink = value("member-shopee-link");
      if (category === "video_comments") {
        const lines = value("member-comment-text").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        if (lines.length !== Number(product.qty) || lines.length > 20) return setNotice("Jumlah komentar harus tepat sesuai paket (maksimal 20).", true);
        order.commentText = lines.join("\n");
      }
      if (category === "followers") {
        const file = document.getElementById("member-account-photo")?.files?.[0];
        if (!file) return setNotice("Upload foto akun Shopee terlebih dahulu.", true);
        if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 3*1024*1024) return setNotice("Foto harus JPG, PNG, atau WEBP dengan ukuran maksimal 3 MB.", true);
        const cfg = window.SUPABASE_CONFIG || {};
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g,"") || "jpg";
        const path = "orders/member-" + Date.now() + "-" + crypto.randomUUID() + "." + ext;
        const upload = await client.storage.from("order-photos").upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) return setNotice("Foto gagal diunggah: " + upload.error.message, true);
        order.photoPath = path;
        order.photoUrl = client.storage.from("order-photos").getPublicUrl(path)?.data?.publicUrl || "";
      }
    }
    if (button) { button.disabled = true; button.textContent = "Memproses pesanan..."; }
    resultBox.textContent = "";
    try {
      const token = await accessToken();
      const response = await fetch("/api/member-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ category, qty: Number(product.qty), order })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Checkout saldo gagal.");
      resultBox.textContent = "Pesanan berhasil dibuat. Invoice: " + (data.invoice || "tersimpan") + ". Total: " + rupiah(data.amount) + ". Saldo tersisa: " + rupiah(data.balance) + ".";
      setNotice("Pembelian dengan saldo member berhasil.");
      await refreshStatus();
      event.currentTarget.reset();
      document.getElementById("wallet-order-fields").replaceChildren();
      document.getElementById("wallet-price").textContent = "Pilih produk untuk melihat harga.";
    } catch (error) {
      setNotice(error.message || "Checkout saldo gagal.", true);
    } finally {
      if (button) { button.disabled = false; button.textContent = "Bayar dengan Saldo"; }
    }
  });

  async function resumePendingPayment() {
    const result = await api("resume_pending");
    if (!result.pending) return false;
    await showPayment(result.pending);
    if (!result.pending.qrisUrl && !result.pending.qrContent && !result.pending.qrImage) {
      setNotice("Pembayaran lama ditemukan, tetapi data gambar QRIS tidak tersedia. Tekan Periksa Pembayaran atau hubungi admin jika QRIS belum dibayar.", true);
    } else {
      setNotice("Pembayaran yang masih menunggu berhasil dipulihkan. Anda dapat melanjutkan pembayaran atau memeriksa statusnya.");
    }
    return true;
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
    document.getElementById("wallet-checkout").hidden = !active;
    if (active && memberProducts.length === 0) await loadMemberProducts();
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
      const response = await fetch("/api/member-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", phone, password })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Pendaftaran gagal.");
      const { error: sessionError } = await client.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token
      });
      if (sessionError) throw sessionError;
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
      const phone = normalizePhone(form.get("phone"));
      const password = String(form.get("password") || "");
      const response = await fetch("/api/member-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", phone, password })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Login gagal.");
      const { error: sessionError } = await client.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token
      });
      if (sessionError) throw sessionError;
      await refreshStatus();
      const resumed = await resumePendingPayment();
      if (!resumed) setNotice("Login berhasil.");
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
      await showPayment(payment);
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
        try {
          await refreshStatus();
          await resumePendingPayment();
        } catch (error) { setNotice(error.message, true); }
      }
    });
  }
  init();
})();
