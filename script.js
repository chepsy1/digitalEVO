const DEFAULT_FOLLOWERS=[
 {qty:100,price:7800,original:9500,sold:'20+',img:'assets/100.webp'},
 {qty:200,price:15600,original:19000,sold:'10+',img:'assets/200.webp'},
 {qty:300,price:21500,original:28500,sold:'10+',img:'assets/300.webp'},
 {qty:500,price:29800,original:45000,sold:'20+',img:'assets/500.webp'},
 {qty:1000,price:57200,original:85000,sold:'50+',img:'assets/1000.webp'},
 {qty:1500,price:84500,original:135000,sold:'30+',img:'assets/1500.webp'},
 {qty:2000,price:112000,original:179000,sold:'30+',img:'assets/1500.webp'},
 {qty:3000,price:168000,original:266000,sold:'8+',img:'assets/3000.webp'},
 {qty:5000,price:275000,original:420000,sold:'10+',img:'assets/5000.webp'}
];
DEFAULT_FOLLOWERS[6].img='assets/2000.webp';
const DEFAULT_ACCOUNTS=[
 {qty:10000,original:380000,price:325000,sold:'',img:'assets/akun-premium-product.webp'},
 {qty:20000,original:595000,price:520000,sold:'',img:'assets/akun-premium-product.webp'},
 {qty:30000,original:860000,price:700000,sold:'',img:'assets/akun-premium-product.webp'},
 {qty:50000,original:1180000,price:999000,sold:'',img:'assets/akun-premium-product.webp'}
];
const DEFAULT_SITE={
 followerEyebrow:'PAKET FOLLOWERS', followerTitle:'Paket Followers Shopee', followerSubtitle:'', followerDiscount:'DISKON hingga 37%',
 accountEyebrow:'KATEGORI PRODUK', accountTitle:'Akun Shopee Premium', accountDescription:'',
 contactEyebrow:'BUTUH BANTUAN?', contactTitle:'Hubungi admin digitalEVO', contactWhatsapp:'0851 8535 3434'
};
const DEFAULT_IMAGES={logo:'assets/logo.webp',header:'assets/header-utama.webp',footer:'assets/footer-cta.webp',followersBanner:'assets/promo-500-5000.webp',accountBanner:'assets/banner-akun-shopee-kuning.webp'};
let products=DEFAULT_FOLLOWERS.map(x=>({...x}));
let accountProducts=DEFAULT_ACCOUNTS.map(x=>({...x}));
let site={...DEFAULT_SITE};
let images={...DEFAULT_IMAGES};
const rupiah=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0);
const discountPct=p=>Math.round((1-(Number(p.price)||0)/(Number(p.original)||1))*100);
const escapeHtml=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function renderSite(){
 const grid=document.getElementById('productGrid'); const accountGrid=document.getElementById('accountProductGrid');
 if(grid){grid.innerHTML='';products.forEach(p=>{grid.insertAdjacentHTML('beforeend',`<article class="product-card"><div class="discount-badge">DISKON ${discountPct(p)}%</div><img class="product-image" src="${escapeHtml(p.img)}" alt="${Number(p.qty).toLocaleString('id-ID')} Followers Shopee Premium" loading="lazy"><div class="product-info"><h3>${Number(p.qty).toLocaleString('id-ID')} Followers</h3><div class="price-row"><span class="original-price">${rupiah(p.original)}</span><span class="discount-price">${rupiah(p.price)}</span></div><div class="sold-month">🔥 ${escapeHtml(p.sold||'')} terjual/bln</div><div class="product-actions"><button class="btn btn-primary order-btn" data-qty="${p.qty}">Order Sekarang</button></div></div></article>`)});}
 if(accountGrid){accountGrid.innerHTML='';accountProducts.forEach(p=>accountGrid.insertAdjacentHTML('beforeend',`<article class="product-card account-product-card"><div class="discount-badge">DISKON ${discountPct(p)}%</div><img class="product-image" src="${escapeHtml(p.img)}" alt="Akun Shopee ${Number(p.qty).toLocaleString('id-ID')} Followers" loading="lazy"><div class="product-info"><h3>AKUN Shopee ${Number(p.qty).toLocaleString('id-ID')} Followers</h3><div class="price-row"><span class="original-price">${rupiah(p.original)}</span><span class="discount-price">${rupiah(p.price)}</span></div><div class="product-actions"><button class="btn btn-primary account-order-btn" data-account-qty="${p.qty}">Order Sekarang</button></div></div></article>`));}
 document.querySelector('.brand img')?.setAttribute('src',images.logo);
 document.querySelector('.top-banner img')?.setAttribute('src','assets/header-utama.webp');
 document.querySelector('.bottom-cta-image img')?.setAttribute('src',images.footer);
 const set=(sel,val)=>{const el=document.querySelector(sel);if(el&&val!=null)el.textContent=val};
 set('.product-head .eyebrow',site.followerEyebrow);set('.product-head h2',site.followerTitle);set('.section-subtitle',site.followerSubtitle);set('.head-badge',site.followerDiscount);
 set('.account-category-head .eyebrow',site.accountEyebrow);set('.account-category-head h2',site.accountTitle);set('.account-category-head p',site.accountDescription);
 set('.contact-band .eyebrow',site.contactEyebrow);set('.contact-band h2',site.contactTitle);const waText=document.querySelector('.contact-band strong');if(waText)waText.textContent=site.contactWhatsapp;
 const accountBanner=document.querySelector('.account-banner-wrap img');if(accountBanner)accountBanner.src='assets/banner-akun-shopee-kuning.webp';
 bindCheckout();
}

const accountDescription=`<strong>Akun Shopee Premium</strong><ul><li>Akun sudah berisi followers Indonesia aktif.</li><li>Akun belum didaftarkan ke Toko Shopee, sehingga Anda bisa mendaftarkannya sendiri.</li><li>Usia akun bervariatif mulai dari 1 Bulan–8 Tahun (tergantung stock yang tersedia).</li><li>Setelah pembelian, Anda bisa langsung mengganti E-mail dan Password.</li><li>Akun belum tertaut oleh Nomor Handphone. Anda bisa melakukan verifikasi dengan nomor handphone.</li></ul>`;
function bindCheckout(){
  const modal=document.getElementById('checkoutModal');
  const select=document.getElementById('packageSelect');
  const paymentModal=document.getElementById('paymentModal');
  if(!modal||!select)return;

  const closeModal=()=>{
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
  };
  const closePayment=()=>{
    paymentModal?.classList.remove('show');
    paymentModal?.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
  };
  paymentModal?.querySelectorAll('[data-payment-close]').forEach(el=>el.onclick=closePayment);

  const setFields=isAccount=>{
    const fields=document.getElementById('checkoutFields');
    if(!fields)return;

    if(isAccount){
      fields.innerHTML=`
        <label>Nama<input id="accountName" autocomplete="name" required placeholder="Masukkan nama Anda" /></label>
        <label>Nomor WhatsApp / Email Untuk Mendapatkan Username dan Password Akun<input id="accountContact" type="text" autocomplete="email" required placeholder="Masukkan Nomor WhatsApp atau Email" /></label>
      `;
    }else{
      fields.innerHTML=`
        <label id="shopeeLinkLabel">Link / Username Shopee<input id="shopeeLink" required placeholder="masukkan username atau link akun shopee" /></label>
        <label id="customerWaLabel">WhatsApp<input id="customerWa" required inputmode="tel" placeholder="08xxxxxxxxxx" /></label>
      `;
    }
  };
  const followerOptions=products.map(p=>`<option value="${p.qty}">${Number(p.qty).toLocaleString('id-ID')} Followers — ${rupiah(p.price)}</option>`).join('');
  const update=qty=>{
    const p=products.find(x=>x.qty===Number(qty)); if(!p)return;
    document.getElementById('orderTotal').textContent=rupiah(p.price);
    document.getElementById('checkoutDescription').innerHTML=`<strong>Followers Shopee REAL-HUMAN Permanent</strong><ul><li>Estimasi Pengerjaan 1 Jam–48 Jam.</li><li>Pengerjaan dilakukan Otomatis.</li><li>Metode hanya membutuhkan Username atau LINK Profile.</li></ul><p class="product-warning">⚠️ <strong>Mohon untuk tidak mengubah Username atau informasi terkait profil akun setelah melakukan checkout.</strong> ⚠️</p><p class="product-admin">Anda bisa menghubungi <strong>ADMIN</strong> melalui WhatsApp jika Anda telah melakukan pesanan.</p>`;
  };
  const openFollower=qty=>{
    setFields(false);
    document.getElementById('modalTitle').textContent='Order Followers Shopee';
    select.innerHTML=followerOptions;select.value=String(qty);
    document.getElementById('selectedProduct').value=qty;update(qty);
    modal.classList.add('show');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    document.getElementById('shopeeLink').focus();
  };
  const openAccount=qty=>{
    setFields(true);
    document.getElementById('modalTitle').textContent=`Order Akun Shopee ${Number(qty).toLocaleString('id-ID')} Followers`;
    select.innerHTML=accountProducts.map(p=>`<option value="account:${p.qty}">${Number(p.qty).toLocaleString('id-ID')} Followers — ${rupiah(p.price)}</option>`).join('');
    select.value=`account:${qty}`;document.getElementById('selectedProduct').value=`account:${qty}`;
    document.getElementById('checkoutDescription').innerHTML=accountDescription;
    const p=accountProducts.find(x=>x.qty===Number(qty));
    document.getElementById('orderTotal').textContent=rupiah(p?.price||0);
    modal.classList.add('show');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    document.getElementById('accountName').focus();
  };
  document.querySelectorAll('.order-btn').forEach(btn=>btn.onclick=()=>openFollower(Number(btn.dataset.qty)));
  document.querySelectorAll('.account-order-btn').forEach(btn=>btn.onclick=()=>openAccount(Number(btn.dataset.accountQty)));
  modal.querySelectorAll('[data-close]').forEach(el=>el.onclick=closeModal);

  select.onchange=()=>{
    const value=select.value;
    if(value.startsWith('account:')){
      setFields(true);const qty=Number(value.split(':')[1]);const p=accountProducts.find(x=>x.qty===qty);
      document.getElementById('modalTitle').textContent=`Order Akun Shopee ${qty.toLocaleString('id-ID')} Followers`;
      document.getElementById('checkoutDescription').innerHTML=accountDescription;
      document.getElementById('orderTotal').textContent=rupiah(p?.price||0);
    }else{
      setFields(false);document.getElementById('modalTitle').textContent='Order Followers Shopee';update(Number(value));
    }
  };

  let currentPaymentId=null;
  let currentPaymentAmount=0;
  let currentPaymentStartTime=0;
  let paymentTimer=null;
  const setPaymentStatus=(text,cls='')=>{
    const el=document.getElementById('paymentStatus');
    if(el){el.textContent=text;el.className=`payment-status ${cls}`.trim();}
  };
  const showPayment=async payment=>{
    currentPaymentId=payment.paymentId;
    currentPaymentAmount=Number(payment.amount||0);
    currentPaymentStartTime=Number(payment.startTime||Math.floor(Date.now()/1000));
    closeModal();
    document.getElementById('paymentInvoice').textContent=payment.partnerReferenceNo;
    document.getElementById('paymentAmount').textContent=rupiah(payment.amount);
    const img=document.getElementById('qrisImage'),canvas=document.getElementById('qrisCanvas');
    const qrBox=document.querySelector('.qr-box');
    qrBox?.querySelector('.qr-error')?.remove();
    img.hidden=true;canvas.hidden=true;img.removeAttribute('src');
    const ctx=canvas.getContext?.('2d');
    if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height);

    // DANA can return qrImage, qrUrl, and/or qrContent. Prefer the ready-made
    // image, then the QR download URL, and finally generate an image from QR content.
    if(payment.qrImage){
      img.src=payment.qrImage.startsWith('data:')?payment.qrImage:`data:image/png;base64,${payment.qrImage}`;
      img.hidden=false;
    }else if(payment.qrUrl){
      let qrSrc=payment.qrUrl;

      // Gateway dapat mengembalikan URL localhost.
      // Ubah ke gateway Vercel agar dapat diakses browser.
      // Gunakan proxy Vercel agar browser tidak mengakses
      // endpoint QR gateway secara langsung.
      const qrId=qrSrc.split('/').filter(Boolean).pop();

      if(qrId){
        qrSrc='/api/qr/'+encodeURIComponent(qrId);
      }

      img.src=qrSrc;
      img.hidden=false;
      img.onerror=()=>{
        img.hidden=true;

        // Jika QRCode tersedia dan URL gagal sebagai gambar,
        // tampilkan halaman QR gateway melalui iframe fallback.
        if(qrBox){
          const iframe=document.createElement('iframe');
          iframe.src=qrSrc;
          iframe.width='300';
          iframe.height='300';
          iframe.style.border='0';
          iframe.style.borderRadius='12px';
          iframe.setAttribute('title','QRIS ShopeePay');
          qrBox.appendChild(iframe);
        }
      };
    }else if(payment.qrContent){
      // The DANA response contains QRIS as raw QR payload (qrContent).
      // Prefer the local QRCode library when available. If a browser/CDN
      // blocks that library, use a remote QR image fallback so checkout
      // remains usable instead of showing a blank QR area.
      let rendered=false;
      if(window.QRCode && typeof window.QRCode.toCanvas==='function'){
        try{
          canvas.hidden=false;
          await QRCode.toCanvas(canvas,payment.qrContent,{width:280,margin:2});
          rendered=true;
        }catch(err){
          console.error('QR canvas generation failed:',err);
          canvas.hidden=true;
        }
      }
      if(!rendered){
        const fallbackUrl='https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data='+encodeURIComponent(payment.qrContent);
        img.src=fallbackUrl;
        img.hidden=false;
        img.onerror=()=>{
          img.hidden=true;
          if(qrBox)qrBox.insertAdjacentHTML('beforeend','<p class="qr-error">QRIS gagal ditampilkan. Pastikan koneksi internet aktif lalu coba transaksi baru.</p>');
        };
      }
    }else{
      if(qrBox)qrBox.insertAdjacentHTML('beforeend','<p class="qr-error">QRIS belum tersedia dari server. Silakan buat transaksi baru.</p>');
    }
    const expires=new Date(payment.expiresAt || (Date.now()+15*60*1000));
    document.getElementById('paymentExpiry').textContent=`Berlaku sampai ${expires.toLocaleString('id-ID',{
      timeZone:'Asia/Jakarta',
      day:'numeric',
      month:'long',
      year:'numeric',
      hour:'2-digit',
      minute:'2-digit',
      hour12:false
    })} WIB`;
    setPaymentStatus('Menunggu pembayaran...');
    paymentModal.classList.add('show');paymentModal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    clearInterval(paymentTimer);
    paymentTimer=setInterval(()=>checkPayment(false),5000);
  };
  const checkPayment=async(manual=true)=>{
    if(!currentPaymentId)return;
    try{
      const response=await fetch('/api/check-payment',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          paymentId: currentPaymentId,
          amount:Number(currentPaymentAmount),
          startTime:Number(currentPaymentStartTime)
        })
      });

      const data=await response.json();

      if(!response.ok){
        throw new Error(data?.error||data?.message||'Gagal mengecek pembayaran.');
      }

      if(data?.paid===true){
        clearInterval(paymentTimer);

        const order = JSON.parse(sessionStorage.getItem('digitalEVO_pendingOrder') || '{}');

        const paymentTime = new Date().toISOString();

        try {
          await fetch('/api/notify-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...order,
              paymentTime
            })
          });
        } catch {}

        sessionStorage.setItem('digitalEVO_success', JSON.stringify({
          ...order,
          paymentTime
        }));

        sessionStorage.removeItem('digitalEVO_pendingOrder');

        window.location.href = 'success.html';
        return;
      }

      if(manual)setPaymentStatus('Belum ada pembayaran yang terkonfirmasi.');
    }catch(err){
      if(manual)setPaymentStatus(err.message||'Gagal mengecek pembayaran.','failed');
    }
  };
  document.getElementById('checkPaymentBtn')?.addEventListener('click',()=>checkPayment(true));
  document.getElementById('copyInvoiceBtn')?.addEventListener('click',async()=>{
    const value=document.getElementById('paymentInvoice').textContent;
    try{await navigator.clipboard.writeText(value);document.getElementById('copyInvoiceBtn').textContent='Tersalin';setTimeout(()=>document.getElementById('copyInvoiceBtn').textContent='Salin Invoice',1200)}catch{}
  });

  const form=document.getElementById('checkoutForm');
  form.onsubmit=async e=>{
    e.preventDefault();
    const value=select.value;
    const payload={};
    if(value.startsWith('account:')){
      payload.category='account';
      payload.qty=Number(value.split(':')[1]);
      const selectedProduct=accountProducts.find(x=>x.qty===payload.qty);
      payload.amount=Number(selectedProduct?.price||0);
      payload.accountName=document.getElementById('accountName').value.trim();
      payload.accountContact=document.getElementById('accountContact').value.trim();
    }else{
      payload.category='followers';
      payload.qty=Number(value);
      const selectedProduct=products.find(x=>x.qty===payload.qty);
      payload.amount=Number(selectedProduct?.price||0);
      payload.customerWhatsapp=document.getElementById('customerWa').value.trim();
      payload.shopeeLink=document.getElementById('shopeeLink').value.trim();
    }
    const submit=e.submitter||form.querySelector('button[type=submit]');
    if(submit){submit.disabled=true;submit.textContent='Membuat QRIS...';}
    try{
      const response = await fetch('/api/create-qris',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({amount:Number(payload.amount)})
      });

      const data = await response.json();

      if(!response.ok){
        throw new Error(data?.error||data?.message||'Gagal membuat pembayaran QRIS.');
      }

      const gatewayData = data?.data || data?.result || data || {};
      const qrisUrl = gatewayData.qris_url || gatewayData.qr_url || gatewayData.qrUrl || null;
      const paymentId = gatewayData.payment_id || gatewayData.paymentId || gatewayData.transaction_id || gatewayData.transactionId || (qrisUrl ? qrisUrl.split('/').filter(Boolean).pop() : null);

      // Telegram order notification
      try {
        await fetch('https://shoppepay-api-gateway-f7dg.vercel.app/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service:payload.service||payload.product||payload.category||'Followers Shopee',quantity:payload.quantity||payload.qty||'',username:payload.shopeeLink||payload.username||'',total:payload.total||payload.amount||'',payment:'QRIS'})});
      } catch(e) { console.error('Telegram notification failed:',e); }

      // Kirim order otomatis ke Telegram
      try {
        await fetch('https://shoppepay-api-gateway-f7dg.vercel.app/api/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service: payload.service || payload.product || payload.category || 'Followers Shopee',
            quantity: payload.quantity || payload.qty || '',
            username: payload.shopeeLink || payload.username || '',
            total: payload.total || payload.amount || '',
            payment: 'QRIS'
          })
        });
      } catch (telegramError) {
        console.error('Telegram notification failed:', telegramError);
      }

      if(!paymentId && !gatewayData.qrContent && !gatewayData.qr_content && !gatewayData.qrImage && !gatewayData.qr_image && !qrisUrl){
        throw new Error(data?.message || data?.error || 'Gateway gagal membuat QRIS.');
      }

      sessionStorage.setItem('digitalEVO_pendingOrder', JSON.stringify({
        product: payload.category === 'account' ? 'Account Premium' : 'Followers Indonesia',
        quantity: Number(payload.qty || 0),
        amount: Number(data.data.amount || payload.amount),
        transaction: paymentId,
        customerWhatsapp: payload.customerWhatsapp || '',
        shopeeLink: payload.shopeeLink || '',
        accountName: payload.accountName || '',
        accountContact: payload.accountContact || '',
        createdAt: new Date().toISOString()
      }));

      await showPayment({
        paymentId,
        partnerReferenceNo:paymentId,
        amount:Number(data.data.amount||payload.amount),
        qrUrl:qrisUrl,
        qrContent:gatewayData.qrContent || gatewayData.qr_content,
        qrImage:gatewayData.qrImage || gatewayData.qr_image,
        expiresAt:gatewayData.expires_at || gatewayData.expiresAt,
        startTime:Math.floor(Date.now()/1000)
      });
    }catch(err){
      alert(err?.message||'Gagal membuat pembayaran QRIS. Silakan coba lagi.');
    }finally{
      if(submit){submit.disabled=false;submit.textContent='Bayar dengan QRIS';}
    }
  };
}

async function loadRemote(){
 const cfg=window.SUPABASE_CONFIG||{};if(!cfg.url||!cfg.anonKey||!window.supabase?.createClient)return;
 try{const client=window.supabase.createClient(cfg.url,cfg.anonKey);const [{data:s},{data:p}]=await Promise.all([client.from('site_settings').select('key,value'),client.from('products').select('*').order('category').order('sort_order')]);if(s){const siteRow=s.find(x=>x.key==='site');const imageRow=s.find(x=>x.key==='images');if(siteRow)site={...site,...siteRow.value};if(imageRow)images={...images,...imageRow.value}}if(p?.length){products=p.filter(x=>x.category==='followers').map(x=>({qty:x.qty,price:x.price,original:x.original,sold:x.sold||'',img:x.image_url||'assets/100.webp'}));accountProducts=p.filter(x=>x.category==='account').map(x=>({qty:x.qty,price:x.price,original:x.original,sold:x.sold||'',img:x.image_url||'assets/akun-premium-product.webp'}))}renderSite()}catch(err){console.warn('Supabase belum terhubung, memakai data lokal.',err)}
}

function initSalesIndicator(){
 const el=document.getElementById('salesCount');
 if(!el)return;
 const key='digitalEVO_sales_indicator_v1';
 const now=Date.now();
 const DAY=24*60*60*1000;
 let data=null;
 try{data=JSON.parse(localStorage.getItem(key)||'null')}catch{}
 if(!data||typeof data.value!=='number'||now-data.createdAt>=DAY){
   const value=64+Math.floor(Math.random()*26);
   data={value,createdAt:now};
   try{localStorage.setItem(key,JSON.stringify(data))}catch{}
 }
 el.textContent=data.value;
}

document.addEventListener('DOMContentLoaded',()=>{initSalesIndicator();renderSite();document.querySelector('.menu-toggle')?.addEventListener('click',()=>{const n=document.getElementById('mainNav'),b=document.querySelector('.menu-toggle');n.classList.toggle('open');b.setAttribute('aria-expanded',n.classList.contains('open'))});document.querySelectorAll('.nav a').forEach(a=>a.addEventListener('click',()=>document.getElementById('mainNav')?.classList.remove('open')));const y=document.getElementById('year');if(y)y.textContent=new Date().getFullYear();loadRemote();});
