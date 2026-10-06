const cfg = window.SUPABASE_CONFIG || {};
const client = (cfg.url && cfg.anonKey && window.supabase?.createClient)
  ? window.supabase.createClient(cfg.url, cfg.anonKey)
  : null;

let products = [];
let settings = {};
let images = {};
let orders = [];

const $ = id => document.getElementById(id);

function msg(id, text) {
  const el = $(id);
  if (el) el.textContent = text || '';
}

function rupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function dateID(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short'
  }) + ' WIB';
}

function needConfig() {
  if (!client) {
    msg(
      'loginMsg',
      'Supabase belum terhubung. Periksa supabase-config.js.'
    );
    return false;
  }
  return true;
}

/* =========================
   AUTH
========================= */

async function verifyAdmin() {
  const {
    data: { session }
  } = await client.auth.getSession();

  if (!session) return false;

  const { data, error } = await client.rpc('is_admin');

  if (error || data !== true) return false;

  return true;
}

async function login() {
  if (!needConfig()) return;

  msg('loginMsg', 'Login...');

  const { error } = await client.auth.signInWithPassword({
    email: $('loginEmail').value.trim(),
    password: $('loginPassword').value
  });

  if (error) {
    msg('loginMsg', error.message);
    return;
  }

  await showPanel();
}

async function logout() {
  await client.auth.signOut();
  location.reload();
}

/* =========================
   NAVIGATION
========================= */

function setupNavigation() {
  const buttons = document.querySelectorAll('[data-section]');

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const target = button.dataset.section;

      document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.remove('active');
      });

      const section = $('section-' + target);
      if (section) section.classList.add('active');

      buttons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      const titles = {
        dashboard: 'Dashboard',
        products: 'Produk',
        orders: 'Pesanan',
        payments: 'Pembayaran',
        content: 'Konten Website',
        media: 'Media',
        settings: 'Pengaturan'
      };

      if ($('pageTitle')) {
        $('pageTitle').textContent = titles[target] || 'Admin Panel';
      }

      if (window.innerWidth <= 850) {
        $('adminSidebar')?.classList.remove('open');
      }
    });
  });
}

function setupMobileMenu() {
  const button = $('mobileMenuBtn');
  if (!button) return;

  button.onclick = () => {
    $('adminSidebar')?.classList.toggle('open');
  };
}

function setupSidebarCollapse() {
  const shell = $('panelView');
  const button = $('sidebarCollapseBtn');
  if (!shell || !button) return;

  const saved = localStorage.getItem('digitalevo_admin_sidebar_collapsed');
  if (saved === '1' && window.innerWidth > 850) {
    shell.classList.add('sidebar-collapsed');
  }

  button.onclick = () => {
    if (window.innerWidth <= 850) {
      $('adminSidebar')?.classList.remove('open');
      return;
    }

    const collapsed = shell.classList.toggle('sidebar-collapsed');
    localStorage.setItem('digitalevo_admin_sidebar_collapsed', collapsed ? '1' : '0');
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('title', collapsed ? 'Tampilkan menu' : 'Minimize menu');
  };
}

/* =========================
   LOAD DATA
========================= */

async function loadAll() {
  const [
    settingsResult,
    productsResult
  ] = await Promise.all([
    client
      .from('site_settings')
      .select('key,value'),

    client
      .from('products')
      .select('*')
      .order('category')
      .order('sort_order')
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (productsResult.error) throw productsResult.error;

  const rows = settingsResult.data || [];

  settings =
    rows.find(row => row.key === 'site')?.value || {};

  images =
    rows.find(row => row.key === 'images')?.value || {};

  products = productsResult.data || [];

  fillSettings();
  renderImages();
  renderProducts('followers', $('followersTable'));
  renderProducts('account', $('accountsTable'));

  updateDashboard();
  renderProductSummary();

  await loadOrders();
  renderActualSales();
  populateAdminFreeProducts();
  await loadAnalytics();
}

/* =========================
   SALES HELPERS
========================= */

const PAID_STATUSES = new Set(['paid','processing','completed','success','succeeded','settled']);

function isPaidOrder(order) {
  const payment = String(order?.payment_status || '').toLowerCase();
  const status = String(order?.order_status || '').toLowerCase();
  return PAID_STATUSES.has(payment) || PAID_STATUSES.has(status);
}

function orderUnits(order) {
  const n = Number(order?.quantity ?? order?.qty ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function orderAmount(order) {
  const n = Number(order?.amount ?? order?.total ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getSalesSummary() {
  const paid = orders.filter(isPaidOrder);
  const units = paid.reduce((sum,o)=>sum + orderUnits(o),0);
  const revenue = paid.reduce((sum,o)=>sum + orderAmount(o),0);
  const byProduct = {};
  paid.forEach(o=>{
    const key = String(o.product_id || o.product_name || o.product || 'unknown');
    if(!byProduct[key]) byProduct[key] = {
      product_id:o.product_id || '',
      name:o.product_name || o.product || 'Produk',
      units:0, revenue:0
    };
    byProduct[key].units += orderUnits(o);
    byProduct[key].revenue += orderAmount(o);
  });
  return {paid,units,revenue,byProduct};
}

/* =========================
   DASHBOARD
========================= */

function updateDashboard() {
  const followerCount =
    products.filter(p => p.category === 'followers').length;

  const accountCount =
    products.filter(p => p.category === 'account').length;

  const totalProducts = products.length;

  if ($('statProducts')) {
    $('statProducts').textContent = totalProducts;
  }

  const sales = getSalesSummary();

  if ($('statPaid')) {
    $('statPaid').textContent = sales.paid.length.toLocaleString('id-ID');
  }

  if ($('statUnitsSold')) {
    $('statUnitsSold').textContent = sales.units.toLocaleString('id-ID');
  }

  if ($('statOrders')) {
    $('statOrders').textContent = orders.length;
  }

  if ($('statRevenue')) {
    $('statRevenue').textContent = rupiah(sales.revenue);
  }

  if ($('dashboardDate')) {
    $('dashboardDate').textContent =
      new Date().toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        dateStyle: 'full'
      });
  }

  if ($('followerProductCount')) {
    $('followerProductCount').textContent = followerCount;
  }

  if ($('accountProductCount')) {
    $('accountProductCount').textContent = accountCount;
  }
}

function renderActualSales() {
  const box = $('actualSalesTable');
  if (!box) return;

  const sales = getSalesSummary();
  const rows = Object.values(sales.byProduct).sort((a,b) => b.units - a.units);

  if (!rows.length) {
    box.innerHTML = `
      <div class="admin-empty">
        <strong>Belum ada penjualan berhasil.</strong>
        <br>Setelah pembayaran terkonfirmasi, angka akan bertambah otomatis.
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Produk</th><th>Terjual</th><th>Pendapatan</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td><strong>${escapeHtml(row.name)}</strong></td>
              <td><strong>${row.units.toLocaleString('id-ID')} unit</strong></td>
              <td>${rupiah(row.revenue)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderProductSummary() {
  const box = $('productSummary');
  if (!box) return;

  const followers =
    products.filter(p => p.category === 'followers');

  const accounts =
    products.filter(p => p.category === 'account');

  box.innerHTML = `
    <div class="admin-grid">
      <div>
        <strong>Followers</strong>
        <div class="admin-stat-value">${followers.length}</div>
        <p class="admin-stat-note">
          Produk tersedia
        </p>
      </div>

      <div>
        <strong>Account Premium</strong>
        <div class="admin-stat-value">${accounts.length}</div>
        <p class="admin-stat-note">
          Produk tersedia
        </p>
      </div>
    </div>
  `;
}

/* =========================
   ORDERS
========================= */

async function loadOrders() {
  try {
    const { data, error } = await client
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10000);

    if (error) {
      orders = [];
      renderOrdersUnavailable(error);
      renderPayments();
      updateDashboard();
      return;
    }

    orders = data || [];

    renderOrders();
    renderPayments();
    updateDashboard();
    renderRecentOrders();
    renderActualSales();

  } catch (error) {
    orders = [];
    renderOrdersUnavailable(error);
  }
}

function renderOrdersUnavailable(error) {
  const box = $('ordersTable');

  if (box) {
    box.innerHTML = `
      <div class="admin-empty">
        <strong>Data pesanan belum tersedia.</strong>
        <br>
        Tabel orders belum dibuat di Supabase.
      </div>
    `;
  }

  if ($('recentOrders')) {
    $('recentOrders').innerHTML = `
      <div class="admin-empty">
        Belum ada data pesanan.
      </div>
    `;
  }
}

function orderStatus(status) {
  const value = String(status || 'pending').toLowerCase();

  const labels = {
    pending: 'Menunggu',
    paid: 'Dibayar',
    processing: 'Diproses',
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
    failed: 'Gagal'
  };

  return `
    <span class="status-badge status-${value}">
      ${labels[value] || value}
    </span>
  `;
}

function renderOrders() {
  const box = $('ordersTable');
  if (!box) return;

  if (!orders.length) {
    box.innerHTML = `
      <div class="admin-empty">
        Belum ada pesanan.
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>WhatsApp</th>
            <th>Produk</th>
            <th>Jumlah</th>
            <th>Harga</th>
            <th>Pembayaran</th>
            <th>Status</th>
            <th>Checkout</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(order => `
            <tr>
              <td><strong>${escapeHtml(order.transaction_id || order.id || '-')}</strong></td>
              <td>${escapeHtml(order.customer_whatsapp || order.account_contact || order.accountContact || '-')}</td>
              <td>${escapeHtml(order.product_name || order.product || '-')}</td>
              <td>${Number(order.quantity || order.qty || 0).toLocaleString('id-ID')}</td>
              <td>${rupiah(order.amount || order.total)}</td>
              <td>${orderStatus(order.payment_status || order.status)}</td>
              <td>${orderStatus(order.order_status || order.status)}</td>
              <td>${dateID(order.created_at || order.checkout_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  applyOrderFilters();
}

function renderRecentOrders() {
  const box = $('recentOrders');
  if (!box) return;

  const recent = orders.slice(0, 5);

  if (!recent.length) {
    box.innerHTML = `
      <div class="admin-empty">
        Belum ada pesanan.
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Transaksi</th>
            <th>Produk</th>
            <th>Nominal</th>
            <th>Status</th>
            <th>Waktu</th>
          </tr>
        </thead>
        <tbody>
          ${recent.map(order => `
            <tr>
              <td>${escapeHtml(order.transaction_id || '-')}</td>
              <td>${escapeHtml(order.product_name || '-')}</td>
              <td>${rupiah(order.amount)}</td>
              <td>${orderStatus(order.payment_status)}</td>
              <td>${dateID(order.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* =========================
   PAYMENT
========================= */

function renderPayments() {
  const box = $('paymentsTable');

  const paid = orders.filter(o =>
    ['paid', 'processing', 'completed'].includes(
      o.payment_status
    )
  ).length;

  const pending = orders.filter(o =>
    o.payment_status === 'pending'
  ).length;

  const cancelled = orders.filter(o =>
    ['cancelled', 'failed'].includes(o.payment_status)
  ).length;

  if ($('paymentPaidCount')) {
    $('paymentPaidCount').textContent = paid;
  }

  if ($('paymentPendingCount')) {
    $('paymentPendingCount').textContent = pending;
  }

  if ($('paymentCancelledCount')) {
    $('paymentCancelledCount').textContent = cancelled;
  }

  if (!box) return;

  if (!orders.length) {
    box.innerHTML = `
      <div class="admin-empty">
        Belum ada data pembayaran.
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Transaksi</th>
            <th>Nominal</th>
            <th>Status</th>
            <th>Dibayar</th>
            <th>Diperbarui</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(order => `
            <tr>
              <td>${escapeHtml(order.transaction_id || '-')}</td>
              <td>${rupiah(order.amount)}</td>
              <td>${orderStatus(order.payment_status)}</td>
              <td>${dateID(order.paid_at)}</td>
              <td>${dateID(order.updated_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* =========================
   FILTER
========================= */

function applyOrderFilters() {
  const box = $('ordersTable');
  if (!box) return;

  const search =
    ($('orderSearch')?.value || '').toLowerCase();

  const status =
    $('orderStatusFilter')?.value || '';

  const filtered = orders.filter(order => {
    const text = [
      order.transaction_id,
      order.product_name,
      order.customer_whatsapp
    ]
      .join(' ')
      .toLowerCase();

    const matchesSearch =
      !search || text.includes(search);

    const matchesStatus =
      !status ||
      order.payment_status === status ||
      order.order_status === status ||
      order.status === status;

    return matchesSearch && matchesStatus;
  });

  const tbody = box.querySelector('tbody');

  if (!tbody) return;

  tbody.innerHTML = filtered.map(order => `
    <tr>
      <td><strong>${escapeHtml(order.transaction_id || order.id || '-')}</strong></td>
      <td>${escapeHtml(order.customer_whatsapp || order.account_contact || order.accountContact || '-')}</td>
      <td>${escapeHtml(order.product_name || order.product || '-')}</td>
      <td>${Number(order.quantity || order.qty || 0).toLocaleString('id-ID')}</td>
      <td>${rupiah(order.amount || order.total)}</td>
      <td>${orderStatus(order.payment_status || order.status)}</td>
      <td>${orderStatus(order.order_status || order.status)}</td>
      <td>${dateID(order.created_at || order.checkout_at)}</td>
    </tr>
  `).join('');

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">Tidak ada pesanan yang cocok.</td>
      </tr>
    `;
  }
}

/* =========================
   CONTENT
========================= */

function fillSettings() {
  const fields = [
    'followerTitle',
    'followerSubtitle',
    'followerEyebrow',
    'followerDiscount',
    'accountTitle',
    'accountEyebrow',
    'accountDescription',
    'contactEyebrow',
    'contactTitle',
    'contactWhatsapp'
  ];

  fields.forEach(id => {
    if ($(id)) {
      $(id).value = settings[id] || '';
    }
  });
}

async function saveSetting(key, value) {
  const { error } = await client
    .from('site_settings')
    .upsert({
      key,
      value,
      updated_at: new Date().toISOString()
    });

  if (error) throw error;
}

async function saveSiteContent() {
  const value = {
    followerTitle: $('followerTitle')?.value || '',
    followerSubtitle: $('followerSubtitle')?.value || '',
    followerEyebrow: $('followerEyebrow')?.value || '',
    followerDiscount: $('followerDiscount')?.value || '',
    accountTitle: $('accountTitle')?.value || '',
    accountEyebrow: $('accountEyebrow')?.value || '',
    accountDescription: $('accountDescription')?.value || '',
    contactEyebrow: $('contactEyebrow')?.value || '',
    contactTitle: $('contactTitle')?.value || '',
    contactWhatsapp: $('contactWhatsapp')?.value || ''
  };

  try {
    await saveSetting('site', value);
    settings = value;
    msg('siteMsg', 'Konten website berhasil disimpan.');
  } catch (error) {
    msg('siteMsg', error.message);
  }
}

/* =========================
   MEDIA
========================= */

const imageLabels = {
  logo: 'Logo',
  header: 'Header',
  followersBanner: 'Banner Followers',
  accountBanner: 'Banner Akun Premium',
  footer: 'Footer'
};

function renderImages() {
  const box = $('imageSettings');
  if (!box) return;

  box.innerHTML = Object.entries(imageLabels)
    .map(([key, label]) => `
      <div class="image-item">
        <img
          src="${escapeAttr(images[key] || '')}"
          alt="${escapeAttr(label)}"
        >

        <strong>${escapeHtml(label)}</strong>

        <input
          type="file"
          accept="image/*"
          data-image="${key}"
        >
      </div>
    `)
    .join('');

  box
    .querySelectorAll('input[type="file"]')
    .forEach(input => {
      input.onchange = () =>
        uploadSiteImage(
          input.dataset.image,
          input.files[0]
        );
    });
}

async function uploadSiteImage(key, file) {
  if (!file) return;

  msg(
    'imageMsg',
    'Mengunggah ' + imageLabels[key] + '...'
  );

  const ext =
    (file.name.split('.').pop() || 'jpg')
      .toLowerCase();

  const path =
    `site/${key}-${Date.now()}.${ext}`;

  const { error } = await client.storage
    .from('site-assets')
    .upload(path, file, {
      upsert: false,
      contentType: file.type
    });

  if (error) {
    msg('imageMsg', error.message);
    return;
  }

  const url =
    client.storage
      .from('site-assets')
      .getPublicUrl(path)
      .data.publicUrl;

  images[key] = url;

  try {
    await saveSetting('images', images);

    renderImages();

    msg(
      'imageMsg',
      imageLabels[key] + ' berhasil diubah.'
    );
  } catch (error) {
    msg('imageMsg', error.message);
  }
}

/* =========================
   PRODUCTS
========================= */

function setupProductTabs() {
  document
    .querySelectorAll('[data-product-tab]')
    .forEach(button => {
      button.onclick = () => {
        const category = button.dataset.productTab;

        document
          .querySelectorAll('[data-product-tab]')
          .forEach(btn =>
            btn.classList.remove('active')
          );

        button.classList.add('active');

        document
          .querySelectorAll('.product-tab-panel')
          .forEach(panel => {
            panel.hidden =
              panel.dataset.productCategory !== category;
          });
      };
    });
}

function productImageFallback(product) {
  const category = product?.category || 'followers';
  const qty = Number(product?.qty || 0);

  if (category === 'account') return 'assets/akun-premium-product.webp';

  const known = {
    100: 'assets/100.webp',
    200: 'assets/200.webp',
    300: 'assets/300.webp',
    500: 'assets/500.webp',
    1000: 'assets/1000.webp',
    1500: 'assets/1500.webp',
    2000: 'assets/2000.webp',
    3000: 'assets/3000.webp',
    5000: 'assets/5000.webp'
  };

  return known[qty] || 'assets/100.webp';
}

function productImageSrc(product) {
  return product?.image_url || productImageFallback(product);
}

function renderProducts(category, box) {
  if (!box) return;

  const rows = products.filter(p => p.category === category);

  box.innerHTML = rows.map(product => `
    <div class="product-row" data-id="${escapeAttr(product.id)}">
      <div class="product-preview">
        <img
          class="product-thumb"
          src="${escapeAttr(productImageSrc(product))}"
          data-fallback="${escapeAttr(productImageFallback(product))}"
          alt="Foto produk"
          onerror="this.onerror=null;this.src=this.dataset.fallback;"
        >
        <span class="product-photo-state">${product.image_url ? 'Foto tersimpan' : 'Foto bawaan'}</span>
      </div>

      <label>
        Jumlah
        <input class="f-qty" type="number" min="0" value="${Number(product.qty || 0)}">
      </label>

      <label>
        Harga asli
        <input class="f-original" type="number" min="0" value="${Number(product.original || 0)}">
      </label>

      <label>
        Harga promo
        <input class="f-price" type="number" min="0" value="${Number(product.price || 0)}">
      </label>

      <label>
        Terjual/bln
        <input class="f-sold" value="${escapeAttr(product.sold || '')}" placeholder="Contoh: 1.2K">
      </label>

      <div class="actions">
        <button class="btn btn-primary save-product" type="button">Simpan</button>
        <button class="btn btn-danger delete-product" type="button">Hapus</button>
        <label class="btn btn-secondary product-upload-label">
          Ganti Foto
          <input class="file-input product-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
        </label>
        <span class="product-action-msg" aria-live="polite"></span>
      </div>
    </div>
  `).join('') || `<div class="admin-empty">Belum ada produk.</div>`;

  box.querySelectorAll('.save-product').forEach(button => {
    button.onclick = () => saveProduct(button.closest('.product-row'), button);
  });

  box.querySelectorAll('.delete-product').forEach(button => {
    button.onclick = () => deleteProduct(button.closest('.product-row'), button);
  });

  box.querySelectorAll('.product-file').forEach(input => {
    input.onchange = () => uploadProductImage(
      input.closest('.product-row'),
      input.files[0],
      input
    );
  });
}

async function saveProduct(row, button) {
  if (!row) return;

  const id = row.dataset.id;
  const current = products.find(p => String(p.id) === String(id));
  if (!current) return;

  const qty = Number(row.querySelector('.f-qty')?.value || 0);
  const original = Number(row.querySelector('.f-original')?.value || 0);
  const price = Number(row.querySelector('.f-price')?.value || 0);
  const sold = row.querySelector('.f-sold')?.value || '';

  if (![qty, original, price].every(Number.isFinite) || qty < 0 || original < 0 || price < 0) {
    alert('Jumlah dan harga harus berupa angka yang valid.');
    return;
  }

  const oldText = button?.textContent || 'Simpan';
  if (button) {
    button.disabled = true;
    button.textContent = 'Menyimpan...';
  }

  const { data, error } = await client
    .from('products')
    .update({
      category: current.category,
      qty,
      original,
      price,
      sold,
      sort_order: Number(current.sort_order || 0),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*');

  if (error) {
    alert('Gagal menyimpan produk: ' + error.message + '\n\nPastikan akun Anda terdaftar di public.admins dan SQL RLS terbaru sudah dijalankan.');
    if (button) {
      button.disabled = false;
      button.textContent = oldText;
    }
    return;
  }

  if (!data?.length) {
    alert('Produk tidak berubah. Supabase tidak mengembalikan baris yang diperbarui. Periksa login admin/RLS.');
    if (button) {
      button.disabled = false;
      button.textContent = oldText;
    }
    return;
  }

  const msgEl = row.querySelector('.product-action-msg');
  if (msgEl) msgEl.textContent = 'Tersimpan ✓';

  products = products.map(p => String(p.id) === String(id) ? data[0] : p);
  renderProducts(current.category, current.category === 'followers' ? $('followersTable') : $('accountsTable'));
  updateDashboard();
  renderProductSummary();
  populateAdminFreeProducts();
}

async function uploadProductImage(row, file, input) {
  if (!row || !file) return;

  if (!file.type.startsWith('image/')) {
    alert('File harus berupa gambar.');
    if (input) input.value = '';
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert('Ukuran foto maksimal 5 MB.');
    if (input) input.value = '';
    return;
  }

  const id = row.dataset.id;
  const current = products.find(p => String(p.id) === String(id));
  const button = row.querySelector('.product-upload-label');
  const msgEl = row.querySelector('.product-action-msg');
  const thumb = row.querySelector('.product-thumb');

  if (button) button.classList.add('is-uploading');
  if (msgEl) msgEl.textContent = 'Mengunggah foto...';

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `products/${id}.${ext}`;

  const { error: uploadError } = await client.storage
    .from('site-assets')
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600'
    });

  if (uploadError) {
    alert('Gagal mengunggah foto: ' + uploadError.message + '\n\nPastikan bucket site-assets bersifat public dan policy upload admin sudah dijalankan.');
    if (button) button.classList.remove('is-uploading');
    if (msgEl) msgEl.textContent = '';
    if (input) input.value = '';
    return;
  }

  const url = client.storage.from('site-assets').getPublicUrl(path).data.publicUrl;
  const cacheBustedUrl = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;

  const { data, error: updateError } = await client
    .from('products')
    .update({
      image_url: cacheBustedUrl,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*');

  if (updateError) {
    alert('Foto berhasil diunggah tetapi gagal disimpan ke produk: ' + updateError.message);
    if (button) button.classList.remove('is-uploading');
    if (msgEl) msgEl.textContent = '';
    if (input) input.value = '';
    return;
  }

  if (!data?.length) {
    alert('Foto terunggah tetapi produk tidak ter-update. Periksa RLS admin pada tabel products.');
    if (button) button.classList.remove('is-uploading');
    return;
  }

  products = products.map(p => String(p.id) === String(id) ? data[0] : p);
  if (thumb) {
    thumb.src = cacheBustedUrl;
    thumb.dataset.fallback = productImageFallback(data[0] || current);
  }
  if (msgEl) msgEl.textContent = 'Foto tersimpan ✓';
  if (button) button.classList.remove('is-uploading');
  if (input) input.value = '';

  renderProducts(current?.category || data[0].category, (current?.category || data[0].category) === 'followers' ? $('followersTable') : $('accountsTable'));
}

async function deleteProduct(row) {
  if (!row) return;

  if (!confirm('Hapus produk ini?')) return;

  const { error } = await client
    .from('products')
    .delete()
    .eq('id', row.dataset.id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadAll();
}

async function addProduct(category) {
  const count =
    products.filter(p => p.category === category).length;

  const { error } = await client
    .from('products')
    .insert({
      category,
      qty: 100,
      original: 0,
      price: 0,
      sold: '',
      image_url:
        category === 'account'
          ? 'assets/akun-premium-product.webp'
          : 'assets/100.webp',
      sort_order: count + 1
    });

  if (error) {
    alert(error.message);
    return;
  }

  await loadAll();
}

/* =========================
   HELPERS
========================= */

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}


/* =========================
   ANALYTICS V2
========================= */

let analyticsRange = '24h';

function analyticsSince(range) {
  const now = Date.now();
  if (range === '24h') return new Date(now - 24 * 60 * 60 * 1000);
  if (range === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (range === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000);
  return new Date(0);
}

function setText(id, value) {
  if ($(id)) $(id).textContent = value;
}

async function loadAnalytics() {
  if (!client) return;

  const since24 = analyticsSince('24h').toISOString();
  const since7 = analyticsSince('7d').toISOString();
  const since30 = analyticsSince('30d').toISOString();

  try {
    const [summaryResult, clicks, events] = await Promise.all([
      client.rpc('analytics_summary'),
      client.from('analytics_events').select('event_type,product_name,quantity,created_at').eq('event_type','product_click').gte('created_at', since30).limit(10000),
      client.from('analytics_events').select('event_type,product_name,quantity,created_at,value').gte('created_at', since30).limit(20000)
    ]);

    const summary = summaryResult.data || {};
    setText('statVisitors24h', Number(summary.visitors24h || 0).toLocaleString('id-ID'));
    setText('statVisitors7d', Number(summary.visitors7d || 0).toLocaleString('id-ID'));
    setText('statVisitors30d', Number(summary.visitors30d || 0).toLocaleString('id-ID'));
    setText('statVisitorsAll', Number(summary.visitorsAll || 0).toLocaleString('id-ID'));

    const clickRows = clicks.data || [];
    setText('statProductClicks', Number(summary.clicksAll || 0).toLocaleString('id-ID'));

    const paidOrders = orders.filter(isPaidOrder);
    const units = paidOrders.reduce((sum,o)=>sum + Number(o.quantity || o.qty || 0),0);
    setText('statUnitsSold', units.toLocaleString('id-ID'));

    const revenueSince = since => paidOrders.filter(o => new Date(o.created_at || o.checkout_at || 0) >= since)
      .reduce((sum,o)=>sum + Number(o.amount || o.total || 0),0);

    setText('statRevenue24h', rupiah(revenueSince(analyticsSince('24h'))));
    setText('statRevenue7d', rupiah(revenueSince(analyticsSince('7d'))));
    setText('statRevenue30d', rupiah(revenueSince(analyticsSince('30d'))));
    setText('statRevenueAll', rupiah(revenueSince(new Date(0))));

    renderAnalyticsCharts(events.data || [], analyticsRange);
    renderFunnel(events.data || []);
    renderTopProducts(clickRows);
  } catch (error) {
    console.warn('Analytics belum siap:', error);
  }
}

function renderBars(containerId, points, money=false) {
  const box = $(containerId);
  if (!box) return;
  if (!points.length || points.every(x => !x.value)) {
    box.innerHTML = '<div class="chart-empty">Belum ada data pada periode ini.</div>';
    return;
  }
  const max = Math.max(...points.map(x => x.value), 1);
  box.innerHTML = points.map(p => {
    const height = Math.max(4, Math.round((p.value / max) * 175));
    const label = escapeHtml(p.label);
    const value = money ? rupiah(p.value) : Number(p.value).toLocaleString('id-ID');
    return `<div class="bar" style="height:${height}px" title="${value}"><span class="bar-value">${money ? (p.value >= 1000000 ? 'Rp'+(p.value/1000000).toFixed(1)+'jt' : 'Rp'+Math.round(p.value/1000)+'rb') : p.value}</span><span class="bar-label">${label}</span></div>`;
  }).join('');
}

function bucketEvents(rows, range, money=false) {
  const now = new Date();
  const since = analyticsSince(range);
  const filtered = rows.filter(r => new Date(r.created_at) >= since);
  const count = range === '24h' ? 12 : range === '7d' ? 7 : 10;
  const step = (now - since) / count;
  return Array.from({length:count},(_,i)=>{
    const start = new Date(since.getTime() + step*i);
    const end = new Date(since.getTime() + step*(i+1));
    const value = filtered.filter(r=>{
      const t=new Date(r.created_at).getTime();
      return t>=start.getTime() && t<end.getTime();
    }).reduce((sum,r)=>sum + Number(r.value || r.amount || 1),0);
    return {label: range==='24h' ? start.getHours()+':00' : (start.getDate()+'/'+(start.getMonth()+1)), value};
  });
}

function renderAnalyticsCharts(events, range) {
  const traffic = events.filter(e => e.event_type === 'page_view').map(e => ({...e,value:1}));
  renderBars('trafficChart', bucketEvents(traffic, range), false);

  const revenueRows = orders.filter(isPaidOrder)
    .map(o => ({created_at:o.created_at || o.checkout_at, value:Number(o.amount || o.total || 0)}));
  renderBars('revenueChart', bucketEvents(revenueRows, range, true), true);
}

function renderFunnel(events) {
  const views = events.filter(e=>e.event_type==='page_view').length;
  const clicks = events.filter(e=>e.event_type==='product_click').length;
  const checkouts = events.filter(e=>e.event_type==='checkout_started').length;
  const paid = orders.filter(o=>['paid','processing','completed'].includes(String(o.payment_status || o.status || '').toLowerCase())).length;
  const max = Math.max(views,1);
  const rows = [['Pengunjung',views],['Klik Produk',clicks],['Checkout',checkouts],['Pembayaran',paid]];
  const box=$('conversionFunnel'); if(!box)return;
  box.innerHTML=rows.map(([name,val])=>`<div class="funnel-row"><span>${name}</span><div class="funnel-track"><div class="funnel-fill" style="width:${Math.min(100,(val/max)*100)}%"></div></div><strong>${Number(val).toLocaleString('id-ID')}</strong></div>`).join('');
}

function renderTopProducts(clickRows) {
  const map = {};
  clickRows.forEach(r=>{ const name=r.product_name||'Produk'; map[name]=(map[name]||0)+1; });
  const rows=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const box=$('topProducts'); if(!box)return;
  box.innerHTML=rows.length ? rows.map(([name,count],i)=>`<div class="rank-item"><span class="rank-number">${i+1}</span><div><div class="rank-name">${escapeHtml(name)}</div><div class="rank-meta">Klik produk</div></div><span class="rank-value">${count.toLocaleString('id-ID')}</span></div>`).join('') : '<div class="admin-empty">Belum ada klik produk.</div>';
}

async function adminFreeCheckout() {
  const msgEl=$('adminFreeMsg');
  try {
    let {data:{session}}=await client.auth.getSession();
    if(!session) throw new Error('Sesi admin tidak ditemukan. Silakan login ulang.');
    // Refresh once so the server receives a current access token.
    const refreshed=await client.auth.refreshSession();
    if(refreshed?.data?.session) session=refreshed.data.session;
    const productId=$('adminFreeProduct')?.value;
    const quantity=Math.max(1,Number($('adminFreeQuantity')?.value||1));
    const call=()=>fetch('/api/admin-free-checkout',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
      body:JSON.stringify({productId,quantity})
    });
    let response=await call();
    // If the token was rejected, refresh once more and retry before reporting an invalid session.
    if(response.status===401){
      const retry=await client.auth.refreshSession();
      if(retry?.data?.session){
        session=retry.data.session;
        response=await call();
      }
    }
    const data=await response.json();
    if(!response.ok) throw new Error(data?.error||'Gagal membuat free checkout.');
    if(msgEl) msgEl.textContent=`Berhasil: ${data.invoice} — ${data.product_name}`;
    await loadOrders();
    await loadAnalytics();
  } catch(e) { if(msgEl) msgEl.textContent=e.message; }
}

function populateAdminFreeProducts() {
  const select = $('adminFreeProduct');
  if (!select) return;
  select.innerHTML = products.map(p =>
    `<option value="${escapeAttr(p.id)}">${escapeHtml(p.category === 'account' ? 'Akun' : 'Followers')} ${escapeHtml(p.qty)} — ${rupiah(p.price)}</option>`
  ).join('');
}

function setupAnalytics() {
  document.querySelectorAll('.range-btn').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.range-btn').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); analyticsRange=btn.dataset.range; loadAnalytics();
  }));
  $('refreshAnalytics')?.addEventListener('click',loadAnalytics);
  $('refreshSales')?.addEventListener('click', async()=>{ await loadOrders(); renderActualSales(); await loadAnalytics(); });
  $('adminFreeCheckout')?.addEventListener('click',adminFreeCheckout);

}

/* =========================
   REFRESH
========================= */

async function refreshAdmin() {
  const button = $('refreshAdmin');

  if (button) {
    button.disabled = true;
    button.textContent = 'Memuat...';
  }

  try {
    await loadAll();
    msg('siteMsg', 'Data berhasil diperbarui.');
  } catch (error) {
    msg('siteMsg', error.message);
  }

  if (button) {
    button.disabled = false;
    button.textContent = 'Refresh';
  }
}

/* =========================
   PANEL
========================= */

async function showPanel() {
  if (!(await verifyAdmin())) {
    await client.auth.signOut();

    $('loginView').hidden = false;
    $('panelView').hidden = true;
    $('logoutBtn').hidden = true;

    msg(
      'loginMsg',
      'Akun berhasil login, tetapi belum terdaftar sebagai admin.'
    );

    return;
  }

  $('loginView').hidden = true;
  $('panelView').hidden = false;
  $('logoutBtn').hidden = false;

  setupNavigation();
  setupMobileMenu();
  setupSidebarCollapse();
  setupProductTabs();
  setupAnalytics();

  try {
    await loadAll();
  } catch (error) {
    msg('siteMsg', error.message);
  }
}

/* =========================
   EVENTS
========================= */

$('loginForm')?.addEventListener(
  'submit',
  event => {
    event.preventDefault();
    login();
  }
);

$('logoutBtn')?.addEventListener(
  'click',
  logout
);

$('saveSite')?.addEventListener(
  'click',
  saveSiteContent
);

$('addFollower')?.addEventListener(
  'click',
  () => addProduct('followers')
);

$('addAccount')?.addEventListener(
  'click',
  () => addProduct('account')
);

$('refreshAdmin')?.addEventListener(
  'click',
  refreshAdmin
);

$('orderSearch')?.addEventListener(
  'input',
  applyOrderFilters
);

$('orderStatusFilter')?.addEventListener(
  'change',
  applyOrderFilters
);

client?.auth.onAuthStateChange(
  (_event, session) => {
    if (!session) {
      if ($('loginView')) {
        $('loginView').hidden = false;
      }

      if ($('panelView')) {
        $('panelView').hidden = true;
      }

      if ($('logoutBtn')) {
        $('logoutBtn').hidden = true;
      }
    }
  }
);

/* =========================
   START
========================= */

(async () => {
  if (!needConfig()) return;

  const {
    data: { session }
  } = await client.auth.getSession();

  if (session) {
    await showPanel();
  }
})();
