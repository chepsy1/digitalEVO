(() => {
  const tabs = [...document.querySelectorAll(".tab")];
  const views = { login: document.getElementById("login-view"), register: document.getElementById("register-view") };
  const notice = document.getElementById("notice");
  const dashboard = document.getElementById("member-dashboard");
  const memberProductCatalog = document.getElementById("member-product-catalog");
  const memberIntro = document.getElementById("member-intro");
  const memberProductGrid = document.getElementById("member-product-grid");
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
  function setAuthFormsVisible(visible) {
    tabs.forEach(tab => { tab.hidden = !visible; });
    if (!visible) {
      views.login.hidden = true;
      views.register.hidden = true;
      return;
    }
    const registerActive = document.getElementById("register-tab").classList.contains("active");
    views.login.hidden = registerActive;
    views.register.hidden = !registerActive;
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
    const qrContent = document.getElementById("payment-qr-content");
    const link = document.getElementById("payment-open-link");

    // qrisUrl is commonly a payment/deep link, not an image. Never render it as <img>.
    const imageUrl = payment.qrImage || (String(payment.qrisUrl || "").toLowerCase().startsWith("data:image/") ? payment.qrisUrl : "");
    image.hidden = true;
    canvas.hidden = true;
    qrContent.textContent = payment.qrContent || "";
    qrContent.hidden = true;

    let rendered = false;
    if (payment.qrContent && window.QRCode && typeof window.QRCode.toCanvas === "function") {
      try {
        await window.QRCode.toCanvas(canvas, payment.qrContent, { width: 280, margin: 2 });
        canvas.hidden = false;
        rendered = true;
      } catch (error) {
        console.error("QRIS canvas gagal dibuat:", error);
      }
    }
    if (!rendered && imageUrl) {
      image.src = imageUrl;
      image.hidden = false;
      rendered = true;
    } else if (!rendered && payment.qrContent) {
      // Fallback image renderer in case the QRCode script/CDN fails to load.
      // QRIS payload is payment data, not a credential.
      image.src = "https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=2&data=" + encodeURIComponent(payment.qrContent);
      image.hidden = false;
      image.onerror = () => {
        image.hidden = true;
        image.removeAttribute("src");
        qrContent.hidden = false;
      };
      rendered = true;
    } else if (!imageUrl) {
      image.removeAttribute("src");
    }
    if (!rendered && payment.qrContent) qrContent.hidden = false;

    if (/^https?:/.test(String(payment.qrisUrl || "").toLowerCase())) {
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
  const productQuantityLabel = p => {
    const qty = Number(p.qty).toLocaleString("id-ID");
    const suffix = p.category === "followers" ? " Followers" :
      p.category === "video_views" ? " Views" :
      p.category === "video_likes" ? " Likes" :
      p.category === "video_comments" ? " Custom Comments" :
      p.category === "product_likes" ? " Favorites/Likes" : "";
    return qty + suffix;
  };
  function updateSelectedPackage(p) {
    const label = document.getElementById("wallet-product-label");
    const priceLine = document.getElementById("wallet-price");
    const payButton = document.getElementById("wallet-pay-button");
    if (!p) {
      label.textContent = "Paket produk";
      priceLine.textContent = "";
      payButton.textContent = "Bayar Dengan Saldo";
      return;
    }
    const packageName = categoryLabels[p.category] + " — " + productQuantityLabel(p);
    const price = p.member_price == null ? Number(p.price) : Number(p.member_price);
    label.textContent = "Paket produk " + packageName;
    priceLine.textContent = "Harga member: " + rupiah(price);
    payButton.textContent = "Bayar " + rupiah(price) + " Dengan Saldo";
  }
  const productImage = p => {
    const q = Number(p.qty);
    const files = {
      followers: ({100:"100.webp",200:"200.webp",300:"300.webp",500:"500.webp",1000:"1000.webp",1500:"1500.webp",2000:"2000.webp",3000:"3000.webp",5000:"5000.webp"})[q] || "100.webp",
      account: "akun-premium-product.webp",
      video_views: "product-video-views.svg",
      video_likes: "product-video-likes.svg",
      video_comments: "product-video-comments.svg",
      product_likes: "product-favorites.svg"
    };
    return "/assets/" + (files[p.category] || "100.webp");
  };
  const memberCategoryOrder = ["followers", "video_views", "video_likes", "video_comments", "product_likes"];
  const memberCategoryTitles = {
    followers: "Paket Followers",
    video_views: "Paket Video View",
    video_likes: "Paket Video Likes",
    video_comments: "Paket Custom Comment",
    product_likes: "Paket Produk Likes/Favorite"
  };
  function renderMemberProductCards() {
    if (!memberProductGrid) return;
    memberProductGrid.replaceChildren();

    const sortedProducts = [...memberProducts].sort((a, b) => {
      const categoryDiff = memberCategoryOrder.indexOf(a.category) - memberCategoryOrder.indexOf(b.category);
      if (categoryDiff !== 0) return categoryDiff;
      return Number(a.qty) - Number(b.qty);
    });

    for (const category of memberCategoryOrder) {
      const products = sortedProducts.filter(p => p.category === category);
      if (!products.length) continue;

      const group = document.createElement("section");
      group.className = "member-product-group";
      group.dataset.category = category;

      const heading = document.createElement("h3");
      heading.className = "member-product-group-title";
      heading.textContent = memberCategoryTitles[category];
      group.append(heading);

      const cardsGrid = document.createElement("div");
      cardsGrid.className = "member-product-category-grid";

      for (const p of products) {
        const price = p.member_price == null ? Number(p.price) : Number(p.member_price);
        const card = document.createElement("article");
        card.className = "member-product-card";
        card.dataset.productId = String(p.id);
        const img = document.createElement("img");
        img.src = productImage(p);
        img.alt = categoryLabels[p.category] + " " + Number(p.qty).toLocaleString("id-ID");
        img.loading = "lazy";
        img.onerror = () => { img.onerror = null; img.src = "/assets/product-fallback.svg"; };

        const info = document.createElement("div");
        info.className = "member-product-info";
        const title = document.createElement("h4");
        const quantity = Number(p.qty).toLocaleString("id-ID");
        const suffix = p.category === "followers" ? " Followers" :
          p.category === "video_views" ? " Views" :
          p.category === "video_likes" ? " Likes" :
          p.category === "video_comments" ? " Custom Comments" :
          p.category === "product_likes" ? " Favorites/Likes" : "";
        title.textContent = categoryLabels[p.category] + " — " + quantity + suffix;

        const regular = document.createElement("span");
        regular.className = "regular-price";
        regular.textContent = rupiah(p.price);
        const member = document.createElement("span");
        member.className = "member-price";
        member.textContent = rupiah(price);
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Pilih Produk";
        button.addEventListener("click", () => {
          const select = document.getElementById("wallet-product");
          select.value = String(p.id);
          select.dispatchEvent(new Event("change", { bubbles: true }));
          memberProductGrid.querySelectorAll(".member-product-card").forEach(el => el.classList.toggle("is-selected", el === card));
          document.getElementById("wallet-checkout").scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        info.append(title, regular, member, button);
        card.append(img, info);
        cardsGrid.append(card);
      }

      group.append(cardsGrid);
      memberProductGrid.append(group);
    }
  }
  function renderOrderFields(category, selectedProduct = null) {
    const host = document.getElementById("wallet-order-fields");
    host.replaceChildren();
    const addField = (id, label, type = "text", required = true, placeholder = "") => {
      const wrap = document.createElement("div");
      const elLabel = document.createElement("label");
      elLabel.htmlFor = id; elLabel.textContent = label;
      const input = document.createElement(type === "textarea" ? "textarea" : "input");
      input.id = id; input.name = id; input.required = required; input.placeholder = placeholder;
      if (type === "textarea") input.rows = 10;
      else input.type = type;
      wrap.append(elLabel, input);
      if (id === "member-comment-text") {
        const requiredLines = Number(selectedProduct?.qty || 10);
        input.dataset.requiredLines = String(requiredLines);
        input.setAttribute("aria-describedby", "member-comment-counter");
        const counter = document.createElement("small");
        counter.id = "member-comment-counter";
        counter.className = "comment-counter";
        counter.textContent = "0/" + requiredLines + " komentar";
        const updateCounter = () => {
          const count = input.value.split(/\r?\n/).filter(line => line.trim().length > 0).length;
          counter.textContent = count + "/" + requiredLines + " komentar";
          counter.classList.toggle("is-valid", count === requiredLines);
          counter.classList.toggle("is-invalid", count > requiredLines);
        };
        input.addEventListener("input", updateCounter);
        wrap.append(counter);
      }
      host.append(wrap);
    };
    if (category === "account") {
      addField("member-account-name", "Nama akun/paket yang dipesan");
      addField("member-account-contact", "Kontak penerima / WhatsApp");
    } else {
      addField("member-shopee-link", category === "followers" ? "Link/username Shopee" : category === "product_likes" ? "Link produk Shopee" : category === "video_views" || category === "video_likes" || category === "video_comments" ? "Link video Shopee" : "Link/username Shopee", "text", true, "Tempel link atau username");
      addField("member-customer-whatsapp", "Nomor WhatsApp");
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
      memberProducts = (data || []).filter(p => p.category !== "account" && categoryLabels[p.category] && Number(p.qty) > 0 && Number(p.price) >= 0);
      select.replaceChildren(new Option("Pilih produk dan paket", ""));
      for (const p of memberProducts) {
        const price = p.member_price == null ? Number(p.price) : Number(p.member_price);
        const opt = new Option(categoryLabels[p.category] + " — " + Number(p.qty).toLocaleString("id-ID") + " — " + rupiah(price), String(p.id));
        select.add(opt);
      }
      if (!memberProducts.length) select.replaceChildren(new Option("Produk belum tersedia", ""));
      renderMemberProductCards();
      if (memberProductCatalog) memberProductCatalog.hidden = !memberProducts.length;
      select.addEventListener("change", () => {
        const p = memberProducts.find(x => String(x.id) === select.value);
        updateSelectedPackage(p);
        renderOrderFields(p?.category || "", p || null);
      });
    } catch (error) {
      select.replaceChildren(new Option("Produk belum dapat dimuat", ""));
      if (memberProductCatalog) memberProductCatalog.hidden = true;
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
        const commentValue = document.getElementById("member-comment-text")?.value || "";
        const lines = commentValue.split(/\r?\n/).map(x => x.trim());
        const expectedLines = Number(product.qty);
        if (lines.length !== expectedLines || lines.some(line => !line)) return setNotice("Paket " + expectedLines + " komentar wajib diisi tepat " + expectedLines + " baris, satu komentar per baris. Tidak boleh kurang, lebih, atau ada baris kosong.", true);
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
      updateSelectedPackage(null);
    } catch (error) {
      setNotice(error.message || "Checkout saldo gagal.", true);
    } finally {
      if (button) { button.disabled = false; updateSelectedPackage(memberProducts.find(p => String(p.id) === document.getElementById("wallet-product").value)); }
    }
  });

  async function resumePendingPayment() {
    const result = await api("resume_pending");
    if (result.paid) {
      await refreshStatus();
      paymentPanel.hidden = true;
      activePaymentReference = null;
      setNotice(result.type === "registration"
        ? "Pembayaran lama terverifikasi. Member sudah diaktifkan."
        : "Deposit lama terverifikasi dan saldo sudah diperbarui.");
      return true;
    }
    if (!result.pending) return false;
    if (result.pending.type === "deposit") {
      paymentPanel.hidden = true;
      activePaymentReference = null;
      return false;
    }
    await showPayment(result.pending);
    if (!result.pending.qrisUrl && !result.pending.qrContent && !result.pending.qrImage) {
      setNotice("Pembayaran lama ditemukan, tetapi data gambar QRIS tidak tersedia. Tekan Periksa Pembayaran atau hubungi admin jika QRIS belum dibayar.", true);
    } else {
      setNotice("Pembayaran yang masih menunggu berhasil dipulihkan. Anda dapat melanjutkan pembayaran atau memeriksa statusnya.");
    }
    return true;
  }

  const historyToggle = document.getElementById("member-history-toggle");
  const historyPanel = document.getElementById("member-history-panel");
  const historyList = document.getElementById("member-history-list");
  const historyMessage = document.getElementById("member-history-message");
  const historyMoney = value => rupiah(Number(value || 0));
  function historyDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
  }
  function addHistoryCard(title, detail, amount, date, type, invoice = "") {
    const card = document.createElement("article");
    card.className = "member-history-item";
    const top = document.createElement("div");
    top.className = "member-history-item-top";
    const name = document.createElement("strong");
    name.textContent = title;
    const value = document.createElement("b");
    value.className = Number(amount) < 0 ? "history-amount debit" : "history-amount credit";
    value.textContent = (Number(amount) > 0 ? "+" : "") + historyMoney(amount);
    top.append(name, value);
    const description = document.createElement("p");
    description.textContent = detail || "Transaksi member";
    const meta = document.createElement("small");
    meta.textContent = [invoice ? "Invoice " + invoice : "", historyDate(date), type].filter(Boolean).join(" · ");
    card.append(top, description, meta);
    historyList.append(card);
  }
  async function loadMemberHistory() {
    if (!historyList || !historyMessage) return;
    historyMessage.textContent = "Memuat riwayat transaksi...";
    historyList.replaceChildren();
    try {
      const result = await api("history");
      const orders = new Map((result.orders || []).map(order => [String(order.id), order]));
      const entries = [];
      for (const tx of result.transactions || []) {
        const match = String(tx.source_reference || "").match(/^member-order:([0-9a-f-]{36})$/i);
        const order = match ? orders.get(match[1]) : null;
        entries.push({
          date: tx.created_at,
          render: () => addHistoryCard(
            order?.product_name || (tx.transaction_type === "purchase" ? "Pembelian produk member" : tx.transaction_type === "deposit" ? "Pengisian deposit" : tx.transaction_type === "registration_bonus" ? "Bonus pendaftaran" : tx.transaction_type === "admin_adjustment" ? "Penyesuaian saldo oleh admin" : "Transaksi saldo"),
            [tx.description, order?.shopee_link, order?.account_name, order?.comment_text].filter(Boolean).join(" · "),
            tx.amount,
            tx.created_at,
            tx.transaction_type === "purchase" ? "Pembelian" : tx.transaction_type === "deposit" ? "Deposit berhasil" : tx.transaction_type === "registration_bonus" ? "Bonus" : tx.transaction_type === "admin_adjustment" ? "Isi saldo admin" : tx.transaction_type,
            order?.transaction_id || ""
          )
        });
      }
      for (const dep of result.deposits || []) {
        if (dep.payment_status !== "paid") entries.push({ date: dep.created_at, render: () => addHistoryCard("Deposit " + String(dep.payment_status || "pending"), "Permintaan pengisian deposit · " + (dep.payment_reference || ""), dep.payment_status === "pending" ? 0 : 0, dep.created_at, "Deposit") });
      }
      for (const reg of result.registrations || []) {
        if (reg.payment_status !== "paid") entries.push({ date: reg.created_at, render: () => addHistoryCard("Pendaftaran member " + String(reg.payment_status || "pending"), "Biaya pendaftaran member", 0, reg.created_at, "Pendaftaran") });
      }
      entries.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      for (const entry of entries) entry.render();
      historyMessage.textContent = "Saldo saat ini: " + historyMoney(result.balance) + " · " + entries.length + " catatan";
      if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "member-history-empty";
        empty.textContent = "Belum ada riwayat pembelian atau pengisian saldo.";
        historyList.append(empty);
      }
    } catch (error) {
      historyMessage.textContent = error.message || "Riwayat belum dapat dimuat.";
    }
  }
  historyToggle?.addEventListener("click", async () => {
    const open = historyPanel.hidden;
    historyPanel.hidden = !open;
    historyToggle.setAttribute("aria-expanded", String(open));
    historyToggle.querySelector("span").textContent = open ? "−" : "＋";
    if (open) await loadMemberHistory();
  });
  document.getElementById("member-history-refresh")?.addEventListener("click", loadMemberHistory);

  async function refreshStatus() {
    const result = await api("status");
    const profile = result.profile;
    dashboard.hidden = false;
    setAuthFormsVisible(false);
    if (memberIntro) memberIntro.hidden = true;
    if (memberProductCatalog) memberProductCatalog.hidden = profile?.status !== "active";
    document.getElementById("wallet-balance").textContent = rupiah(result.balance);
    const phoneLabel = document.getElementById("member-phone-label");
    phoneLabel.replaceChildren();
    if (profile?.whatsapp) {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 32 32");
      icon.setAttribute("class", "whatsapp-mark");
      icon.setAttribute("aria-hidden", "true");
      const bubble = document.createElementNS("http://www.w3.org/2000/svg", "path");
      bubble.setAttribute("fill", "#25D366");
      bubble.setAttribute("d", "M16 1a15 15 0 0 0-12.9 22.7L1 31l7.5-2A15 15 0 1 0 16 1Z");
      const handset = document.createElementNS("http://www.w3.org/2000/svg", "path");
      handset.setAttribute("fill", "#fff");
      handset.setAttribute("d", "M23.1 18.7c-.4-.2-2.1-1-2.4-1.1-.3-.1-.6-.2-.8.2-.2.4-.9 1.1-1.1 1.3-.2.2-.4.3-.8.1-.4-.2-1.5-.6-2.8-1.8-1-.9-1.8-2-2-2.4-.2-.4 0-.6.2-.8l.6-.7c.2-.2.2-.4.4-.6.1-.2.1-.4 0-.6-.1-.2-.8-1.9-1.1-2.6-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 2.9s1.2 3.3 1.4 3.5c.2.2 2.4 3.7 5.9 5.2.8.3 1.4.5 1.9.6.8.3 1.6.2 2.2.1.7-.1 2.1-.9 2.4-1.7.3-.8.3-1.5.2-1.7-.1-.2-.3-.3-.7-.5Z");
      icon.append(bubble, handset);
      const phoneText = document.createElement("span");
      phoneText.textContent = profile.whatsapp;
      phoneLabel.append(icon, phoneText);
    }
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

  // Remember only the WhatsApp number; never persist the password.
  const rememberCheckbox = document.getElementById("remember-me");
  const loginPhoneInput = document.getElementById("login-phone");
  try {
    const rememberedPhone = localStorage.getItem("digitalevo_member_remembered_phone");
    if (rememberedPhone) {
      loginPhoneInput.value = rememberedPhone;
      rememberCheckbox.checked = true;
    }
  } catch (_) {}
  rememberCheckbox.addEventListener("change", () => {
    if (!rememberCheckbox.checked) {
      try { localStorage.removeItem("digitalevo_member_remembered_phone"); } catch (_) {}
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
      try {
        if (rememberCheckbox.checked) localStorage.setItem("digitalevo_member_remembered_phone", String(form.get("phone") || ""));
        else localStorage.removeItem("digitalevo_member_remembered_phone");
      } catch (_) {}
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
      if (!Number.isSafeInteger(amount) || amount < 10000 || amount > 10000000) {
        document.getElementById("deposit-amount").setCustomValidity("Minimum deposit adalah Rp10.000.");
        document.getElementById("deposit-amount").reportValidity();
        document.getElementById("deposit-amount").setCustomValidity("");
        return setNotice("Nominal deposit minimum Rp10.000 dan maksimum Rp10.000.000.", true);
      }
      setNotice("Menyiapkan QRIS deposit...");
      paymentPanel.hidden = true;
      activePaymentReference = null;
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
        const refreshed = await refreshStatus();
        paymentPanel.hidden = true;
        activePaymentReference = null;
        if (result.type === "registration" && refreshed?.profile?.status === "active") {
          try { localStorage.setItem("digitalevo_member_welcome_popup", "1"); } catch (_) {}
          window.location.assign("/?memberWelcome=1");
          return;
        }
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
    setAuthFormsVisible(true);
    if (memberIntro) memberIntro.hidden = false;
    if (memberProductCatalog) memberProductCatalog.hidden = true;
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
