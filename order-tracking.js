(function () {
  var form = document.getElementById('devoOrderTrackerForm');
  if (!form) return;
  var phone = document.getElementById('devoOrderTrackerPhone');
  var submit = document.getElementById('devoOrderTrackerSubmit');
  var message = document.getElementById('devoOrderTrackerMessage');
  var results = document.getElementById('devoOrderTrackerResults');
  var money = function (value) { return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value||0)); };
  var date = function (value) { return value ? new Date(value).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB' : '-'; };
  function node(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function detail(parent, label, value, extraClass) {
    var wrap = node('div','devo-order-detail');
    wrap.appendChild(node('span','',label));
    wrap.appendChild(node('strong',extraClass || '',value));
    parent.appendChild(wrap);
  }
  function render(orders) {
    results.replaceChildren();
    orders.forEach(function (order) {
      var card = node('article','devo-order-card');
      var head = node('div','devo-order-card-head');
      var titleWrap = node('div','');
      titleWrap.appendChild(node('h3','', 'Invoice: '+order.invoice));
      titleWrap.appendChild(node('small','', 'Waktu pemesanan: '+date(order.createdAt)));
      head.appendChild(titleWrap);
      var status = order.orderStatus || {label:'Dalam Antrian',key:'queued'};
      head.appendChild(node('span','devo-order-status devo-order-status-'+status.key,status.label));
      card.appendChild(head);
      var details = node('div','devo-order-details');
      detail(details,'Produk / Paket',order.product);
      detail(details,'Total Pembayaran',money(order.amount));
      detail(details,'Status Pembayaran',order.paymentStatus,order.paymentKey === 'paid' ? 'devo-payment-paid' : 'devo-payment-pending');
      detail(details,'Metode Pembayaran',order.paymentMethod);
      detail(details,'Waktu Pembayaran',date(order.paidAt));
      card.appendChild(details);
      results.appendChild(card);
    });
    results.hidden = false;
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    results.hidden = true;
    results.replaceChildren();
    message.textContent = 'Memeriksa pesanan...';
    message.dataset.type = '';
    submit.disabled = true;
    submit.textContent = 'Memeriksa...';
    try {
      var response = await fetch('/api/order-status',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({phone:phone.value.trim()})});
      var data = await response.json().catch(function () { return {}; });
      if (response.status === 404) {
        message.textContent = data.message || 'Maaf, Nomor anda Belum pernah melakukan Pembelian Di Toko Kami';
        message.dataset.type = 'error';
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Gagal memeriksa status pesanan.');
      render(Array.isArray(data.orders) ? data.orders : []);
      message.textContent = 'Pesanan ditemukan. Status ditampilkan sesuai pembaruan terbaru dari admin.';
      message.dataset.type = 'success';
    } catch (error) {
      message.textContent = error.message || 'Terjadi kendala. Silakan coba kembali.';
      message.dataset.type = 'error';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Cek Status Pesanan';
    }
  });
})();