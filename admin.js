const cfg = window.SUPABASE_CONFIG || {};
const client = (cfg.url && cfg.anonKey && window.supabase?.createClient)
  ? window.supabase.createClient(cfg.url, cfg.anonKey)
  : null;

let products = [];
let settings = {};
let images = {};
let orders = [];
let orderRefreshTimer = null;
let activeOrderTab = 'incoming';
let sliderSettings = { interval: 5000, effect: 'fade', slides: [] };

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
  document.querySelectorAll('[data-order-tab]').forEach(button => {
    button.addEventListener('click', () => {
      activeOrderTab = button.dataset.orderTab;
      document.querySelectorAll('[data-order-tab]').forEach(item => item.classList.toggle('active', item === button));
      renderOrders();
    });
  });
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

  sliderSettings = normalizeSliderSettings(rows.find(row => row.key === 'slider')?.value);

  products = productsResult.data || [];

  fillSettings();
  renderImages();
  renderSliderSettings();
  renderProducts('followers', $('followersTable'));
  renderProducts('account', $('accountsTable'));
  renderProducts('video_views', $('videoViewsTable'));
  renderProducts('video_likes', $('videoLikesTable'));
  renderProducts('product_likes', $('productLikesTable'));
  renderProducts('video_comments', $('videoCommentsTable'));

  updateDashboard();
  renderProductSummary();

  await loadOrders();
  populateAdminFreeProducts();
  await loadAnalytics();
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

  const followers = products.filter(p => p.category === 'followers');
  const accounts = products.filter(p => p.category === 'account');
  const videoViews = products.filter(p => p.category === 'video_views');
  const videoLikes = products.filter(p => p.category === 'video_likes');
  const productLikes = products.filter(p => p.category === 'product_likes');
  const videoComments = products.filter(p => p.category === 'video_comments');

  box.innerHTML = `
    <div class="admin-grid">
      <div>
        <strong>Followers</strong>
        <div class="admin-stat-value">${followers.length}</div>
        <p class="admin-stat-note">Produk tersedia</p>
      </div>
      <div>
        <strong>Account Premium</strong>
        <div class="admin-stat-value">${accounts.length}</div>
        <p class="admin-stat-note">Produk tersedia</p>
      </div>
      <div>
        <strong>Shopee Video Views</strong>
        <div class="admin-stat-value">${videoViews.length}</div>
        <p class="admin-stat-note">Produk tersedia</p>
      </div>
      <div>
        <strong>Shopee Video Likes</strong>
        <div class="admin-stat-value">${videoLikes.length}</div>
        <p class="admin-stat-note">Produk tersedia</p>
      </div>
      <div>
        <strong>Shopee Video Custom Comments</strong>
        <div class="admin-stat-value">${videoComments.length}</div>
        <p class="admin-stat-note">Produk tersedia</p>
      </div>
      <div>
        <strong>Shopee Produk Favorite/Likes</strong>
        <div class="admin-stat-value">${productLikes.length}</div>
        <p class="admin-stat-note">Produk tersedia</p>
      </div>
    </div>
  `;
}

/* =========================
   ORDERS
========================= */

async function adminOrderAction(payload) {
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('Sesi admin berakhir. Silakan login kembali.');
  const response = await fetch('/api/admin-orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Permintaan pesanan gagal.');
  return result;
}

async function loadOrders() {
  try {
    // Simpan status kedaluwarsa ke database, bukan hanya menampilkannya di layar.
    try { await adminOrderAction({ action: 'expire' }); } catch (expireError) {
      console.warn('Pembaruan kedaluwarsa belum berhasil:', expireError.message);
    }
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
    expired: 'Kedaluwarsa',
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

function effectivePaymentStatus(order) {
  const status = String(order.payment_status || order.status || 'pending').toLowerCase();
  if (status === 'pending' && order.created_at) {
    const age = Date.now() - new Date(order.created_at).getTime();
    if (Number.isFinite(age) && age >= 15 * 60 * 1000) return 'expired';
  }
  return status;
}

function orderShopeeInput(order) {
  return String(
    order.shopee_link ||
    order.shopeeLink ||
    order.shopee_username ||
    order.shopeeUsername ||
    order.shopee_url ||
    order.shopeeUrl ||
    order.link_username ||
    order.linkUsername ||
    order.link_shopee ||
    order.account_link ||
    order.accountLink ||
    order.account_username ||
    order.accountUsername ||
    order.username ||
    order.link ||
    ''
  ).trim();
}

function renderShopeeInput(order) {
  const value = orderShopeeInput(order);
  if (!value) return '-';
  const safe = escapeHtml(value);
  if (/^https?:\/\//i.test(value)) {
    return `<a href="${escapeAttr(value)}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
  }
  return safe;
}

function canDeleteOrder(order) {
  return ['pending', 'expired'].includes(effectivePaymentStatus(order));
}

async function markOrderPaid(orderId) {
  const order = orders.find(item => String(item.id) === String(orderId));
  if (!order || ['paid', 'processing', 'completed'].includes(String(order.payment_status || order.status || '').toLowerCase())) {
    alert('Pesanan ini sudah berstatus berhasil atau tidak ditemukan.');
    return;
  }
  if (!confirm('Tandai pesanan ini sebagai Pembayaran Berhasil? Pendapatan dan analytics akan ikut diperbarui. Gunakan hanya jika pembayaran sudah Anda pastikan.')) return;
  try {
    await adminOrderAction({ action: 'mark_paid', id: order.id });
    await loadOrders();
    await loadAnalytics();
    alert('Status pesanan berhasil diperbarui.');
  } catch (error) {
    alert('Gagal memperbarui pesanan: ' + error.message);
  }
}

async function deleteOrder(orderId) {
  const order = orders.find(item => String(item.id) === String(orderId));
  if (!order || !canDeleteOrder(order)) {
    alert('Hanya pesanan belum dibayar atau kedaluwarsa yang boleh dihapus.');
    return;
  }
  if (!confirm('Hapus pesanan yang belum dibayar/kedaluwarsa ini? Tindakan tidak dapat dibatalkan.')) return;
  try {
    await adminOrderAction({ action: 'delete', id: order.id });
  } catch (error) {
    alert('Gagal menghapus pesanan: ' + error.message);
    return;
  }
  orders = orders.filter(item => String(item.id) !== String(order.id));
  renderOrders(); renderPayments(); updateDashboard(); renderRecentOrders();
}

function renderOrders() {
  const box = $('ordersTable');
  if (!box) return;

  const tabOrders = orders.filter(order => activeOrderTab === 'paid'
    ? ['paid', 'processing', 'completed'].includes(String(order.payment_status || order.status || '').toLowerCase())
    : !['paid', 'processing', 'completed'].includes(String(order.payment_status || order.status || '').toLowerCase()));

  if (!tabOrders.length) {
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
            <th>Link / Username Shopee</th>
            <th>Produk</th>
            <th>Jumlah</th>
            <th>Harga</th>
            <th>Pembayaran</th>
            <th>Status</th>
            <th>Checkout</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${tabOrders.map(order => `
            <tr>
              <td><strong>${escapeHtml(order.transaction_id || order.id || '-')}</strong></td>
              <td>${escapeHtml(order.customer_whatsapp || order.account_contact || order.accountContact || '-')}</td>
              <td class="order-shopee-link">${renderShopeeInput(order)}</td>
              <td>${escapeHtml(order.product_name || order.product || '-')}${order.comment_text ? `<details class="admin-comment-details"><summary title="Lihat isi komentar" aria-label="Lihat isi komentar">💬</summary><div class="admin-comment-content">${escapeHtml(order.comment_text)}</div></details>` : ''}</td>
              <td>${Number(order.quantity || order.qty || 0).toLocaleString('id-ID')}</td>
              <td>${rupiah(order.amount || order.total)}</td>
              <td>${orderStatus(effectivePaymentStatus(order))}</td>
              <td><div>${orderStatus(order.order_status || 'queued')}</div>${activeOrderTab === 'paid' ? '<label class="admin-order-status-label" for="order-status-'+escapeAttr(order.id)+'">Ubah status pengerjaan</label><select id="order-status-'+escapeAttr(order.id)+'" class="admin-order-status-select" data-order-status-select="'+escapeAttr(order.id)+'"><option value="queued" '+(String(order.order_status||'queued').toLowerCase()==='queued'?'selected':'')+'>Dalam Antrian</option><option value="processing" '+(String(order.order_status||'').toLowerCase()==='processing'?'selected':'')+'>Diproses</option><option value="completed" '+(String(order.order_status||'').toLowerCase()==='completed'?'selected':'')+'>Berhasil</option></select>' : ''}</td>
              <td>${dateID(order.created_at || order.checkout_at)}</td>
              <td><div class="order-action-buttons">${!['paid', 'processing', 'completed'].includes(String(order.payment_status || order.status || '').toLowerCase()) ? `<button type="button" class="btn btn-primary order-mark-paid-btn" data-mark-paid-order="${escapeAttr(order.id)}">Pembayaran Berhasil</button>` : ''}${canDeleteOrder(order) ? `<button type="button" class="btn btn-secondary order-delete-btn" data-delete-order="${escapeAttr(order.id)}">Hapus</button>` : ''}</div></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  box.querySelectorAll('[data-delete-order]').forEach(button => {
    button.addEventListener('click', () => deleteOrder(button.dataset.deleteOrder));
  });
  box.querySelectorAll('[data-mark-paid-order]').forEach(button => {
    button.addEventListener('click', () => markOrderPaid(button.dataset.markPaidOrder));
  });
  box.querySelectorAll('[data-order-status-select]').forEach(select => {
    select.addEventListener('change', async () => {
      const selectedStatus = select.value;
      select.disabled = true;
      try {
        await adminOrderAction({ action: 'set_order_status', id: select.dataset.orderStatusSelect, order_status: selectedStatus });
        const order = orders.find(item => String(item.id) === String(select.dataset.orderStatusSelect));
        if (order) order.order_status = selectedStatus;
        renderOrders();
        renderRecentOrders();
        alert('Status pengerjaan berhasil diperbarui.');
      } catch (error) {
        alert('Gagal mengubah status pengerjaan: ' + error.message);
        select.disabled = false;
      }
    });
  });
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
      order.customer_whatsapp,
      order.shopee_link,
      order.shopeeLink,
      order.shopee_username,
      order.shopeeUsername,
      order.shopee_url,
      order.shopeeUrl,
      order.link_username,
      order.linkUsername,
      order.link_shopee,
      order.account_link,
      order.accountLink,
      order.account_username,
      order.accountUsername,
      order.username,
      order.link
    ]
      .join(' ')
      .toLowerCase();

    const matchesSearch =
      !search || text.includes(search);

    const isPaid = ['paid', 'processing', 'completed'].includes(String(order.payment_status || order.status || '').toLowerCase());
    const matchesTab = activeOrderTab === 'paid' ? isPaid : !isPaid;
    const matchesStatus = !status || effectivePaymentStatus(order) === status || order.order_status === status || order.status === status;

    return matchesSearch && matchesStatus && matchesTab;
  });

  const tbody = box.querySelector('tbody');

  if (!tbody) return;

  tbody.innerHTML = filtered.map(order => `
    <tr>
      <td><strong>${escapeHtml(order.transaction_id || order.id || '-')}</strong></td>
      <td>${escapeHtml(order.customer_whatsapp || order.account_contact || order.accountContact || '-')}</td>
      <td class="order-shopee-link">${renderShopeeInput(order)}</td>
      <td>${escapeHtml(order.product_name || order.product || '-')}</td>
      <td>${Number(order.quantity || order.qty || 0).toLocaleString('id-ID')}</td>
      <td>${rupiah(order.amount || order.total)}</td>
      <td>${orderStatus(order.payment_status || order.status)}</td>
      <td><div>${orderStatus(order.order_status || 'queued')}</div>${activeOrderTab === 'paid' ? '<label class="admin-order-status-label" for="order-status-'+escapeAttr(order.id)+'">Ubah status pengerjaan</label><select id="order-status-'+escapeAttr(order.id)+'" class="admin-order-status-select" data-order-status-select="'+escapeAttr(order.id)+'"><option value="queued" '+(String(order.order_status||'queued').toLowerCase()==='queued'?'selected':'')+'>Dalam Antrian</option><option value="processing" '+(String(order.order_status||'').toLowerCase()==='processing'?'selected':'')+'>Diproses</option><option value="completed" '+(String(order.order_status||'').toLowerCase()==='completed'?'selected':'')+'>Berhasil</option></select>' : ''}</td>
      <td>${dateID(order.created_at || order.checkout_at)}</td>
      <td><div class="order-action-buttons">${!['paid', 'processing', 'completed'].includes(String(order.payment_status || order.status || '').toLowerCase()) ? `<button type="button" class="btn btn-primary order-mark-paid-btn" data-mark-paid-order="${escapeAttr(order.id)}">Pembayaran Berhasil</button>` : ''}${canDeleteOrder(order) ? `<button type="button" class="btn btn-secondary order-delete-btn" data-delete-order="${escapeAttr(order.id)}">Hapus</button>` : ''}</div></td>
    </tr>
  `).join('');

  box.querySelectorAll('[data-delete-order]').forEach(button => button.addEventListener('click', () => deleteOrder(button.dataset.deleteOrder)));
  // applyOrderFilters mengganti isi tbody, jadi tombol Pembayaran Berhasil
  // harus dipasangi event listener kembali setelah baris dirender ulang.
  box.querySelectorAll('[data-mark-paid-order]').forEach(button => {
    button.addEventListener('click', () => markOrderPaid(button.dataset.markPaidOrder));
  });

  box.querySelectorAll('[data-order-status-select]').forEach(select => {
    select.addEventListener('change', async () => {
      const selectedStatus = select.value;
      select.disabled = true;
      try {
        await adminOrderAction({ action: 'set_order_status', id: select.dataset.orderStatusSelect, order_status: selectedStatus });
        const order = orders.find(item => String(item.id) === String(select.dataset.orderStatusSelect));
        if (order) order.order_status = selectedStatus;
        renderOrders();
        renderRecentOrders();
        alert('Status pengerjaan berhasil diperbarui.');
      } catch (error) {
        alert('Gagal mengubah status pengerjaan: ' + error.message);
        select.disabled = false;
      }
    });
  });

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10">Tidak ada pesanan yang cocok.</td>
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
  header: 'Header / Banner Utama',
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
  if (!client) {
    msg('imageMsg', 'Supabase belum terhubung. Periksa supabase-config.js.');
    return;
  }

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
   HEADER SLIDER
========================= */
const MAX_SLIDES = 6;
const DEFAULT_SLIDER = {
  interval: 5000,
  effect: 'fade',
  slides: []
};

const BUILTIN_SLIDER_IMAGES = new Set([
  'assets/header.webp',
  'assets/header-utama.webp',
  'assets/promo-500-5000.webp'
]);

function normalizeSliderSettings(value) {
  const v = value && typeof value === 'object' ? value : {};
  const slides = (Array.isArray(v.slides) ? v.slides : DEFAULT_SLIDER.slides)
    .filter(x => x?.image && !BUILTIN_SLIDER_IMAGES.has(String(x.image).trim()));
  return {
    interval: Math.min(30000, Math.max(1000, Number(v.interval) || 5000)),
    effect: v.effect === 'slide' ? 'slide' : 'fade',
    slides: slides.slice(0, MAX_SLIDES).map(x => ({
      image: String(x?.image || ''),
      alt: String(x?.alt || 'Banner digitalEVO')
    }))
  };
}

function renderSliderSettings() {
  const box = $('sliderSettings');
  if (!box) return;
  sliderSettings = normalizeSliderSettings(sliderSettings);
  const slides = Array.from({length: MAX_SLIDES}, (_, i) => sliderSettings.slides[i] || {image:'', alt:`Banner ${i+1}`});
  if ($('sliderInterval')) $('sliderInterval').value = String(sliderSettings.interval);
  if ($('sliderEffect')) $('sliderEffect').value = sliderSettings.effect;
  box.innerHTML = slides.map((slide, i) => `
    <div class="slider-admin-item" data-slider-index="${i}">
      <div class="slider-admin-preview">
        ${slide.image ? `<img src="${escapeAttr(slide.image)}" alt="${escapeAttr(slide.alt)}">` : '<div class="slider-admin-empty">Belum ada gambar</div>'}
      </div>
      <div class="slider-admin-fields">
        <div class="slider-admin-title"><strong>Banner ${i+1}</strong><span>${slide.image ? 'Aktif' : 'Kosong'}</span></div>
        <label class="slider-file-label">Ganti foto
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-slider-file="${i}">
        </label>
        <label>Alt text
          <input type="text" value="${escapeAttr(slide.alt)}" data-slider-alt="${i}" maxlength="120" placeholder="Deskripsi banner">
        </label>
        <div class="slider-admin-actions">
          <button type="button" class="btn btn-secondary slider-move" data-dir="up" data-index="${i}" ${i===0 || i>=sliderSettings.slides.length?'disabled':''}>↑</button>
          <button type="button" class="btn btn-secondary slider-move" data-dir="down" data-index="${i}" ${i===MAX_SLIDES-1 || i>=sliderSettings.slides.length-1?'disabled':''}>↓</button>
          <button type="button" class="btn btn-secondary slider-clear" data-index="${i}" ${slide.image?'':'disabled'}>Hapus</button>
        </div>
      </div>
    </div>`).join('');

  box.querySelectorAll('[data-slider-file]').forEach(input => {
    input.onchange = () => uploadSliderImage(Number(input.dataset.sliderFile), input.files?.[0]);
  });
  box.querySelectorAll('.slider-move').forEach(btn => {
    btn.onclick = () => moveSlider(Number(btn.dataset.index), btn.dataset.dir);
  });
  box.querySelectorAll('.slider-clear').forEach(btn => {
    btn.onclick = () => clearSlider(Number(btn.dataset.index));
  });
  box.querySelectorAll('[data-slider-alt]').forEach(input => {
    input.oninput = () => { sliderSettings.slides[Number(input.dataset.sliderAlt)].alt = input.value; };
  });
}

function moveSlider(index, direction) {
  if (index < 0 || index >= sliderSettings.slides.length) return;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= sliderSettings.slides.length) return;
  [sliderSettings.slides[index], sliderSettings.slides[target]] = [sliderSettings.slides[target], sliderSettings.slides[index]];
  renderSliderSettings();
}

function clearSlider(index) {
  if (!sliderSettings.slides[index]) return;
  sliderSettings.slides[index] = { image: '', alt: `Banner ${index+1}` };
  while (sliderSettings.slides.length && !sliderSettings.slides[sliderSettings.slides.length - 1].image) sliderSettings.slides.pop();
  renderSliderSettings();
}

async function uploadSliderImage(index, file) {
  if (!file) return;
  if (!client) { msg('sliderMsg', 'Supabase belum terhubung.'); return; }
  if (file.size > 8 * 1024 * 1024) { msg('sliderMsg', 'Ukuran banner maksimal 8 MB.'); return; }
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { msg('sliderMsg', 'Format banner harus JPG, PNG, WEBP, atau GIF.'); return; }
  msg('sliderMsg', `Mengunggah Banner ${index+1}...`);
  const ext = (file.name.split('.').pop() || 'webp').toLowerCase();
  const path = `slider/banner-${Date.now()}-${index}.${ext}`;
  const { error } = await client.storage.from('site-assets').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
  if (error) { msg('sliderMsg', error.message); return; }
  const url = client.storage.from('site-assets').getPublicUrl(path).data.publicUrl;
  while (sliderSettings.slides.length <= index) sliderSettings.slides.push({image:'', alt:`Banner ${sliderSettings.slides.length+1}`});
  sliderSettings.slides[index].image = url;
  if (!sliderSettings.slides[index].alt) sliderSettings.slides[index].alt = `Banner ${index+1}`;
  renderSliderSettings();
  msg('sliderMsg', `Banner ${index+1} berhasil diunggah. Klik Simpan Pengaturan Slider untuk menerapkannya.`);
}

async function saveSliderSettings() {
  if (!client) { msg('sliderMsg', 'Supabase belum terhubung.'); return; }
  const btn = $('saveSlider');
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
  try {
    const cleaned = normalizeSliderSettings({
      interval: Number($('sliderInterval')?.value || 5000),
      effect: $('sliderEffect')?.value || 'fade',
      slides: sliderSettings.slides.filter(x => x?.image).map(x => ({ image: x.image, alt: x.alt || 'Banner digitalEVO' }))
    });
    if (!cleaned.slides.length) throw new Error('Minimal 1 banner harus tersedia.');
    await saveSetting('slider', cleaned);
    sliderSettings = cleaned;
    renderSliderSettings();
    msg('sliderMsg', 'Pengaturan slider berhasil disimpan.');
  } catch (error) {
    msg('sliderMsg', error.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Simpan Pengaturan Slider'; }
  }
}

/* =========================
   PRODUCTS
========================= */

function setupProductTabs() {
  const buttons = document.querySelectorAll('[data-product-category]');
  const panels = {
    followers: $('productFollowersPanel'),
    account: $('productAccountPanel'),
    video_views: $('productVideoViewsPanel'),
    video_likes: $('productVideoLikesPanel'),
    product_likes: $('productProductLikesPanel'),
    video_comments: $('productVideoCommentsPanel')
  };

  buttons.forEach(button => {
    button.onclick = () => {
      const category = button.dataset.productCategory;
      buttons.forEach(item => item.classList.toggle('active', item === button));
      Object.entries(panels).forEach(([key, panel]) => {
        if (panel) panel.classList.toggle('active', key === category);
      });
    };
  });
}

function productImageFallback(product) {
  const category = product?.category || 'followers';
  const qty = Number(product?.qty || 0);

  if (category === 'account') return 'assets/akun-premium-product.webp';
  if (category === 'video_views' || category === 'video_likes' || category === 'video_comments' || category === 'product_likes') return qty >= 1000 ? 'assets/1000.webp' : qty >= 500 ? 'assets/500.webp' : qty >= 200 ? 'assets/200.webp' : 'assets/100.webp';

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

function productTableForCategory(category) {
  if (category === 'followers') return $('followersTable');
  if (category === 'account') return $('accountsTable');
  if (category === 'video_views') return $('videoViewsTable');
  if (category === 'video_likes') return $('videoLikesTable');
  if (category === 'product_likes') return $('productLikesTable');
  if (category === 'video_comments') return $('videoCommentsTable');
  return null;
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
  renderProducts(current.category, productTableForCategory(current.category));
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

  renderProducts(current?.category || data[0].category, productTableForCategory(current?.category || data[0].category));
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
          : category === 'video_comments' ? 'assets/100.webp' : 'assets/100.webp',
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
let analyticsLoading = false;
let analyticsRefreshTimer = null;

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
  if (!client || analyticsLoading) return;
  analyticsLoading = true;

  const since24 = analyticsSince('24h').toISOString();
  const since7 = analyticsSince('7d').toISOString();
  const since30 = analyticsSince('30d').toISOString();

  try {
    const [summaryResult, clicks, events] = await Promise.all([
      client.rpc('analytics_summary'),
      client.from('analytics_events').select('event_type,product_name,quantity,created_at').eq('event_type','product_click').gte('created_at', since30).order('created_at', { ascending: false }).limit(10000),
      client.from('analytics_events').select('event_type,product_name,quantity,created_at,value,metadata,page_path').gte('created_at', since30).order('created_at', { ascending: false }).limit(20000)
    ]);

    // Jangan menganggap kegagalan query sebagai data kosong: tampilkan penyebabnya
    // agar grafik Analytics bisa didiagnosis langsung dari panel admin.
    if (events.error) {
      console.error('Gagal membaca analytics_events:', events.error);
      const chart = $('trafficChart');
      if (chart) chart.textContent = 'Gagal memuat data kunjungan: ' + (events.error.message || 'akses data ditolak');
      throw events.error;
    }
    if (summaryResult.error) {
      console.warn('Gagal membaca ringkasan Analytics:', summaryResult.error);
    }
    if (clicks.error) {
      console.warn('Gagal membaca klik produk Analytics:', clicks.error);
    }

    const summary = summaryResult.data || {};
    setText('statVisitors24h', Number(summary.visitors24h || 0).toLocaleString('id-ID'));
    setText('statVisitors7d', Number(summary.visitors7d || 0).toLocaleString('id-ID'));
    setText('statVisitors30d', Number(summary.visitors30d || 0).toLocaleString('id-ID'));
    setText('statVisitorsAll', Number(summary.visitorsAll || 0).toLocaleString('id-ID'));

    const clickRows = clicks.data || [];
    setText('statProductClicks', Number(summary.clicksAll || 0).toLocaleString('id-ID'));

    const paidOrders = orders.filter(o => ['paid','processing','completed'].includes(String(o.payment_status || o.status || '').toLowerCase()));
    // 'quantity' pada produk followers adalah ukuran paket (mis. 100/500/1000), bukan jumlah paket terjual.
    // Kartu Produk Terjual menghitung checkout pelanggan yang benar-benar membayar, bukan menjumlahkan ukuran paket.
    // Checkout ADMIN_FREE/testing tidak dihitung sebagai penjualan pelanggan.
    const customerPaidOrders = paidOrders.filter(o => String(o.payment_method || '').toUpperCase() !== 'ADMIN_FREE' && Number(o.amount || o.total || 0) > 0);
    setText('statUnitsSold', customerPaidOrders.length.toLocaleString('id-ID'));

    const revenueSince = since => paidOrders.filter(o => new Date(o.created_at || o.checkout_at || 0) >= since)
      .reduce((sum,o)=>sum + Number(o.amount || o.total || 0),0);

    setText('statRevenue24h', rupiah(revenueSince(analyticsSince('24h'))));
    setText('statRevenue7d', rupiah(revenueSince(analyticsSince('7d'))));
    setText('statRevenue30d', rupiah(revenueSince(analyticsSince('30d'))));
    setText('statRevenueAll', rupiah(revenueSince(new Date(0))));

    renderAnalyticsCharts(events.data || [], analyticsRange);
    renderTrafficSources(events.data || []);
    renderFunnel(events.data || []);
    renderTopProducts(clickRows);
  } catch (error) {
    console.warn('Analytics belum siap:', error);
    const chart = $('trafficChart');
    if (chart && !String(chart.textContent || '').includes('Gagal memuat data kunjungan')) {
      chart.textContent = 'Analytics gagal dimuat. Periksa izin akses tabel analytics_events.';
    }
  } finally {
    analyticsLoading = false;
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
  const filtered = rows.filter(r => new Date(r.created_at) >= analyticsSince(range));

  // Grafik 24 jam harus mencakup seluruh rentang bergulir dari sekarang
  // mundur 24 jam. Bucket yang dibulatkan ke jam genap sebelumnya dapat
  // melewatkan kunjungan pada 1–2 jam pertama rentang.
  if (range === '24h') {
    const since = analyticsSince('24h');
    const step = 2 * 60 * 60 * 1000;
    return Array.from({length: 12}, (_, i) => {
      const start = new Date(since.getTime() + i * step);
      const end = new Date(Math.min(start.getTime() + step, now.getTime()));
      const value = filtered.filter(r => {
        const t = new Date(r.created_at).getTime();
        return t >= start.getTime() && t < end.getTime();
      }).reduce((sum, r) => sum + Number(r.value || r.amount || 1), 0);
      return {
        label: String(start.getHours()).padStart(2, '0') + ':00',
        value
      };
    });
  }

  const since = analyticsSince(range);
  const count = range === '7d' ? 7 : 10;
  const step = (now - since) / count;
  return Array.from({length:count},(_,i)=>{
    const start = new Date(since.getTime() + step*i);
    const end = new Date(since.getTime() + step*(i+1));
    const value = filtered.filter(r=>{
      const t=new Date(r.created_at).getTime();
      return t>=start.getTime() && t<end.getTime();
    }).reduce((sum,r)=>sum + Number(r.value || r.amount || 1),0);
    return {label: start.getDate()+'/'+(start.getMonth()+1), value};
  });
}

function renderAnalyticsCharts(events, range) {
  const traffic = events.filter(e => e.event_type === 'page_view').map(e => ({...e,value:1}));
  const trafficPoints = bucketEvents(traffic, range);
  renderBars('trafficChart', trafficPoints, false);

  // Tampilkan diagnosis langsung di grafik jika Supabase mengembalikan data,
  // tetapi tidak ada kunjungan yang masuk ke bucket rentang yang dipilih.
  if (!trafficPoints.some(point => point.value > 0)) {
    const box = $('trafficChart');
    if (box) {
      const latest = traffic.reduce((value, event) => {
        const time = new Date(event.created_at).getTime();
        return Number.isFinite(time) && time > value ? time : value;
      }, 0);
      const latestLabel = latest ? new Date(latest).toLocaleString('id-ID') : 'tidak ada';
      box.innerHTML = '<div class="chart-empty">Diagnostik: event yang diterima panel = ' +
        events.length + '; page_view = ' + traffic.length +
        '; rentang = ' + escapeHtml(range) +
        '; kunjungan terakhir yang diterima = ' + escapeHtml(latestLabel) +
        '. Jika page_view = 0, periksa akses baca tabel atau proyek Supabase yang dipakai admin.</div>';
    }
  }

  const revenueRows = orders.filter(o => ['paid','processing','completed'].includes(String(o.payment_status || o.status || '').toLowerCase()))
    .map(o => ({created_at:o.created_at || o.checkout_at, value:Number(o.amount || o.total || 0)}));
  renderBars('revenueChart', bucketEvents(revenueRows, range, true), true);
}

function renderTrafficSources(events) {
  const box = $('trafficSources');
  if (!box) return;

  const views = events.filter(e => e.event_type === 'page_view');
  const counts = {};
  const details = {};
  views.forEach(event => {
    const meta = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
    const source = String(meta.source || (meta.referrer_host || 'Direct / Tidak diketahui')).slice(0, 120);
    counts[source] = (counts[source] || 0) + 1;
    if (!details[source]) details[source] = { referrer: meta.referrer || '', campaign: meta.utm_campaign || '', medium: meta.utm_medium || '' };
  });

  const rows = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  if (!rows.length) {
    box.innerHTML = '<div class="chart-empty">Belum ada data sumber pengunjung. Setelah deploy, kunjungan baru akan mulai tercatat.</div>';
    return;
  }

  const max = Math.max(...rows.map(row => row[1]), 1);
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  box.innerHTML = rows.slice(0, 12).map(([source, count]) => {
    const safeSource = escapeHtml(source);
    const percent = Math.round(count / total * 100);
    const detail = details[source] || {};
    const sub = detail.campaign ? `Kampanye: ${escapeHtml(detail.campaign)}` :
      detail.medium ? `Medium: ${escapeHtml(detail.medium)}` : '';
    return `<div class="traffic-source-row">
      <div class="traffic-source-top"><strong>${safeSource}</strong><span>${count.toLocaleString('id-ID')} kunjungan · ${percent}%</span></div>
      <div class="traffic-source-track"><div class="traffic-source-fill" style="width:${Math.max(2, count / max * 100)}%"></div></div>
      ${sub ? `<small>${sub}</small>` : ''}
    </div>`;
  }).join('');
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
    const {data:{session}}=await client.auth.getSession();
    if(!session) throw new Error('Sesi admin tidak ditemukan.');
    const selectedValue=$('adminFreeProduct')?.value;
    const selectedProduct = products.find(p => String(p.id) === String(selectedValue));
    const productId = selectedProduct?.id || selectedValue;
    if (!productId) throw new Error('Pilih produk terlebih dahulu.');
    const quantity=Math.max(1,Number($('adminFreeQuantity')?.value||1));
    const response=await fetch('/api/admin-free-checkout',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
      body:JSON.stringify({productId,quantity})
    });
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
    `<option value="${escapeAttr(p.id)}">${escapeHtml(p.category === 'account' ? 'Akun Shopee' : p.category === 'video_views' ? 'Shopee Video Views' : p.category === 'video_likes' ? 'Shopee Video Likes' : 'Followers Shopee')} ${escapeHtml(p.qty)} — ${rupiah(p.price)}</option>`
  ).join('');
}

function setupAnalytics() {
  document.querySelectorAll('.range-btn').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.range-btn').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); analyticsRange=btn.dataset.range; loadAnalytics();
  }));
  $('refreshAnalytics')?.addEventListener('click',loadAnalytics);
  $('adminFreeCheckout')?.addEventListener('click',adminFreeCheckout);

  // Perbarui Analytics otomatis setiap 60 detik saat admin sedang melihat tab Analytics.
  // Tidak menyentuh alur checkout atau pembayaran QRIS.
  if (analyticsRefreshTimer) clearInterval(analyticsRefreshTimer);
  analyticsRefreshTimer = setInterval(() => {
    const panel = $('panelView');
    const analyticsSection = $('section-analytics');
    if (document.visibilityState === 'visible' &&
        panel && !panel.hidden &&
        analyticsSection && analyticsSection.classList.contains('active')) {
      loadAnalytics();
    }
  }, 60 * 1000);
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
    await loadReviewAdmin();
    if (orderRefreshTimer) clearInterval(orderRefreshTimer);
    orderRefreshTimer = setInterval(() => { if (client && !document.hidden) loadOrders(); }, 30000);
  } catch (error) {
    msg('siteMsg', error.message);
  }
}

/* =========================
   ULASAN & KOMENTAR
========================= */
let reviewAdminStatus = 'pending';
async function loadReviewAdmin() {
  const box = $('reviewAdminList'); if (!box || !client) return;
  box.innerHTML = '<p>Memuat ulasan...</p>';
  let query = client.from('comments').select('*').order('pinned', {ascending:false}).order('created_at',{ascending:false});
  if (reviewAdminStatus !== 'all') query = query.eq('status', reviewAdminStatus);
  const {data,error} = await query.limit(200);
  if (error) { box.innerHTML = '<p>Gagal memuat ulasan. Pastikan migrasi SQL review sudah dijalankan.</p>'; msg('reviewAdminMsg', error.message); return; }
  msg('reviewAdminMsg', `${data.length} ulasan ditampilkan.`);
  if (!data.length) { box.innerHTML = '<p>Belum ada ulasan pada kategori ini.</p>'; return; }
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  box.innerHTML = data.map(item => `<article class="review-admin-card" data-review-id="${esc(item.id)}"><div class="review-admin-head"><div><strong>${esc(item.name)}</strong> <span class="review-admin-badge">${esc(item.status)}</span>${item.pinned?' <span class="review-admin-badge pinned">📌 Pinned</span>':''}<div class="review-admin-meta">${esc(new Date(item.created_at).toLocaleString('id-ID'))} · ${'★'.repeat(Math.max(1,Math.min(5,Number(item.rating)||5)))}</div></div>${(Array.isArray(item.photo_urls)&&item.photo_urls.length?item.photo_urls:(item.photo_url?[item.photo_url]:[])).map((photo,i)=>`<a href="${esc(photo)}" target="_blank" rel="noopener">Lihat foto ${i+1}</a>`).join(' ')}</div><label>Nama<input data-field="name" value="${esc(item.name)}" maxlength="60"></label><label>Link toko/akun<input data-field="store_url" value="${esc(item.store_url||'')}" placeholder="https://..."></label><label>Komentar<textarea data-field="body" rows="3" maxlength="1000">${esc(item.body)}</textarea></label><label>Balasan admin (ditampilkan di website)<textarea data-field="admin_reply" rows="3" maxlength="1000" placeholder="Tulis balasan untuk pembeli...">${esc(item.admin_reply||'')}</textarea></label><label>Rating<select data-field="rating">${[5,4,3,2,1].map(n=>`<option value="${n}" ${Number(item.rating)===n?'selected':''}>${n}/5</option>`).join('')}</select></label><div class="review-admin-actions">${item.status!=='approved'?'<button type="button" data-action="approve">Setujui</button>':''}${item.status!=='rejected'?'<button type="button" data-action="reject">Tolak</button>':''}<button type="button" data-action="save">Simpan edit</button><button type="button" data-action="pin">${item.pinned?'Lepas pin':'Sematkan'}</button><button type="button" class="danger" data-action="delete">Hapus</button></div></article>`).join('');
  box.querySelectorAll('.review-admin-card').forEach(card => card.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
    const id=card.dataset.reviewId, action=button.dataset.action; button.disabled=true;
    try {
      let result;
      if(action==='approve'||action==='reject') result=await client.from('comments').update({status:action==='approve'?'approved':'rejected'}).eq('id',id);
      else if(action==='pin') result=await client.from('comments').update({pinned:!card.querySelector('.review-admin-badge.pinned')}).eq('id',id);
      else if(action==='save') { const name=card.querySelector('[data-field="name"]').value.trim(), body=card.querySelector('[data-field="body"]').value.trim(), store_input=card.querySelector('[data-field="store_url"]').value.trim(), admin_reply=card.querySelector('[data-field="admin_reply"]').value.trim(), rating=Number(card.querySelector('[data-field="rating"]').value); if(name.length<2||body.length<3)throw Error('Nama minimal 2 karakter dan komentar minimal 3 karakter.'); let store_url=''; if(store_input){const candidate=/^[a-z][a-z0-9+.-]*:\/\//i.test(store_input)?store_input:'https://'+store_input;const u=new URL(candidate);if(!['http:','https:'].includes(u.protocol)||!u.hostname.includes('.'))throw Error('Masukkan alamat web yang valid.');store_url=u.href;} result=await client.from('comments').update({name,body,store_url:store_url||null,rating,admin_reply:admin_reply||null}).eq('id',id); }
      else if(action==='delete'){if(!confirm('Hapus ulasan ini secara permanen?')){button.disabled=false;return;}result=await client.from('comments').delete().eq('id',id);}
      if(result?.error)throw result.error; msg('reviewAdminMsg','Perubahan ulasan berhasil disimpan.','success'); await loadReviewAdmin();
    } catch(e){msg('reviewAdminMsg',e.message||'Perubahan gagal disimpan.','error');button.disabled=false;}
  })));
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

$('addVideoViews')?.addEventListener(
  'click',
  () => addProduct('video_views')
);

$('addVideoLikes')?.addEventListener(
  'click',
  () => addProduct('video_likes')
);

$('addProductLikes')?.addEventListener(
  'click',
  () => addProduct('product_likes')
);

$('addVideoComments')?.addEventListener(
  'click',
  () => addProduct('video_comments')
);

$('refreshAdmin')?.addEventListener(
  'click',
  refreshAdmin
);

$('saveSlider')?.addEventListener('click', saveSliderSettings);

$('orderSearch')?.addEventListener(
  'input',
  applyOrderFilters
);

$('orderStatusFilter')?.addEventListener(
  'change',
  applyOrderFilters
);

$('refreshReviews')?.addEventListener('click', loadReviewAdmin);
document.querySelectorAll('[data-review-status]').forEach(button => button.addEventListener('click', () => { reviewAdminStatus=button.dataset.reviewStatus; document.querySelectorAll('[data-review-status]').forEach(b=>b.classList.toggle('active',b===button)); loadReviewAdmin(); }));

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
