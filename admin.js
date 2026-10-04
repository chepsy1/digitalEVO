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

  if ($('statPaid')) {
    $('statPaid').textContent =
      orders.filter(o =>
        ['paid', 'processing', 'completed'].includes(
          o.payment_status || o.status
        )
      ).length;
  }

  if ($('statOrders')) {
    $('statOrders').textContent = orders.length;
  }

  if ($('statRevenue')) {
    const revenue = orders
      .filter(o =>
        ['paid', 'processing', 'completed'].includes(
          o.payment_status || o.status
        )
      )
      .reduce((sum, o) => sum + Number(o.amount || 0), 0);

    $('statRevenue').textContent = rupiah(revenue);
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
      .order('created_at', { ascending: false });

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
            <th>Transaksi</th>
            <th>Produk</th>
            <th>Jumlah</th>
            <th>Nominal</th>
            <th>Pembayaran</th>
            <th>Status</th>
            <th>Waktu</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(order => `
            <tr>
              <td>${escapeHtml(order.transaction_id || order.id || '-')}</td>
              <td>${escapeHtml(order.product_name || '-')}</td>
              <td>${Number(order.quantity || 0).toLocaleString('id-ID')}</td>
              <td>${rupiah(order.amount)}</td>
              <td>${orderStatus(order.payment_status)}</td>
              <td>${orderStatus(order.order_status)}</td>
              <td>${dateID(order.created_at)}</td>
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
      order.order_status === status;

    return matchesSearch && matchesStatus;
  });

  const tbody = box.querySelector('tbody');

  if (!tbody) return;

  tbody.innerHTML = filtered.map(order => `
    <tr>
      <td>${escapeHtml(order.transaction_id || order.id || '-')}</td>
      <td>${escapeHtml(order.product_name || '-')}</td>
      <td>${Number(order.quantity || 0).toLocaleString('id-ID')}</td>
      <td>${rupiah(order.amount)}</td>
      <td>${orderStatus(order.payment_status)}</td>
      <td>${orderStatus(order.order_status)}</td>
      <td>${dateID(order.created_at)}</td>
    </tr>
  `).join('');

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">Tidak ada pesanan yang cocok.</td>
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

function renderProducts(category, box) {
  if (!box) return;

  const rows =
    products.filter(p => p.category === category);

  box.innerHTML =
    rows.map(product => `
      <div
        class="product-row"
        data-id="${escapeAttr(product.id)}"
      >
        <img
          src="${escapeAttr(product.image_url || '')}"
          alt=""
        >

        <label>
          Jumlah
          <input
            class="f-qty"
            type="number"
            value="${Number(product.qty || 0)}"
          >
        </label>

        <label>
          Harga asli
          <input
            class="f-original"
            type="number"
            value="${Number(product.original || 0)}"
          >
        </label>

        <label>
          Harga promo
          <input
            class="f-price"
            type="number"
            value="${Number(product.price || 0)}"
          >
        </label>

        <label>
          Terjual/bln
          <input
            class="f-sold"
            value="${escapeAttr(product.sold || '')}"
          >
        </label>

        <div class="actions">
          <button
            class="btn btn-primary save-product"
          >
            Simpan
          </button>

          <button
            class="btn btn-danger delete-product"
          >
            Hapus
          </button>

          <input
            class="file-input product-file"
            type="file"
            accept="image/*"
          >
        </div>
      </div>
    `).join('') || `
      <div class="admin-empty">
        Belum ada produk.
      </div>
    `;

  box
    .querySelectorAll('.save-product')
    .forEach(button => {
      button.onclick = () =>
        saveProduct(
          button.closest('.product-row')
        );
    });

  box
    .querySelectorAll('.delete-product')
    .forEach(button => {
      button.onclick = () =>
        deleteProduct(
          button.closest('.product-row')
        );
    });

  box
    .querySelectorAll('.product-file')
    .forEach(input => {
      input.onchange = () =>
        uploadProductImage(
          input.closest('.product-row'),
          input.files[0]
        );
    });
}

async function saveProduct(row) {
  if (!row) return;

  const id = row.dataset.id;

  const current =
    products.find(p => String(p.id) === String(id));

  if (!current) return;

  const payload = {
    category: current.category,
    qty: Number(
      row.querySelector('.f-qty')?.value || 0
    ),
    original: Number(
      row.querySelector('.f-original')?.value || 0
    ),
    price: Number(
      row.querySelector('.f-price')?.value || 0
    ),
    sold:
      row.querySelector('.f-sold')?.value || '',
    sort_order: current.sort_order,
    updated_at: new Date().toISOString()
  };

  const { error } = await client
    .from('products')
    .update(payload)
    .eq('id', id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadAll();
}

async function uploadProductImage(row, file) {
  if (!row || !file) return;

  const id = row.dataset.id;

  const ext =
    (file.name.split('.').pop() || 'jpg')
      .toLowerCase();

  const path =
    `products/${id}-${Date.now()}.${ext}`;

  const { error } = await client.storage
    .from('site-assets')
    .upload(path, file, {
      upsert: false,
      contentType: file.type
    });

  if (error) {
    alert(error.message);
    return;
  }

  const url =
    client.storage
      .from('site-assets')
      .getPublicUrl(path)
      .data.publicUrl;

  const { error: updateError } =
    await client
      .from('products')
      .update({
        image_url: url,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

  if (updateError) {
    alert(updateError.message);
    return;
  }

  await loadAll();
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
  setupProductTabs();

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
