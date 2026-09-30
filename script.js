const products=[
 {qty:100,price:7800,original:9500,sold:'20+',img:'assets/100.png'},
 {qty:200,price:15600,original:19000,sold:'10+',img:'assets/200.png'},
 {qty:300,price:21500,original:28500,sold:'10+',img:'assets/300.png'},
 {qty:500,price:29800,original:45000,sold:'20+',img:'assets/500.png'},
 {qty:1000,price:57200,original:85000,sold:'50+',img:'assets/1000.png'},
 {qty:1500,price:84500,original:135000,sold:'30+',img:'assets/1500.png'},
 {qty:2000,price:112000,original:179000,sold:'30+',img:'assets/2000.png'},
 {qty:3000,price:168000,original:266000,sold:'8+',img:'assets/3000.png'},
 {qty:5000,price:275000,original:420000,sold:'10+',img:'assets/5000.png'}
];
const discountPct=p=>Math.round((1-p.price/p.original)*100);
const rupiah=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
const grid=document.getElementById('productGrid');
const select=document.getElementById('packageSelect');
products.forEach(p=>{if(p.qty===500){grid.insertAdjacentHTML('beforeend',`<div class="product-promo-banner"><img src="assets/promo-500-5000.png" alt="Promo harga terbaik di paket pembelian 500 sampai 5000 followers" loading="lazy"></div>`)}grid.insertAdjacentHTML('beforeend',`<article class="product-card"><div class="discount-badge">DISKON ${discountPct(p)}%</div><img class="product-image" src="${p.img}" alt="${p.qty.toLocaleString('id-ID')} Followers Shopee Premium" loading="lazy"><div class="product-info"><h3>${p.qty.toLocaleString('id-ID')} Followers</h3><div class="price-row"><span class="original-price">${rupiah(p.original)}</span><span class="discount-price">${rupiah(p.price)}</span></div><div class="sold-month">🔥 ${p.sold} terjual/bln</div><div class="product-actions"><button class="btn btn-primary order-btn" data-qty="${p.qty}">Order Sekarang</button></div></div></article>`);select.insertAdjacentHTML('beforeend',`<option value="${p.qty}">${p.qty.toLocaleString('id-ID')} Followers — ${rupiah(p.price)}</option>`)})

// Category: Akun Shopee Premium
const accountProducts=[
 {qty:10000,original:380000,price:325000},
 {qty:20000,original:595000,price:520000},
 {qty:30000,original:860000,price:700000},
 {qty:50000,original:1180000,price:999000}
];
const accountGrid=document.getElementById('accountProductGrid');
const accountDiscountPct=p=>Math.round((1-p.price/p.original)*100);
if(accountGrid){
 accountProducts.forEach(p=>{
  accountGrid.insertAdjacentHTML('beforeend',`<article class="product-card account-product-card"><div class="discount-badge">DISKON ${accountDiscountPct(p)}%</div><img class="product-image" src="assets/akun-shopee-premium-banner.png" alt="Akun Shopee ${p.qty.toLocaleString('id-ID')} Followers" loading="lazy"><div class="product-info"><h3>AKUN Shopee ${p.qty.toLocaleString('id-ID')} Followers</h3><div class="price-row"><span class="original-price">${rupiah(p.original)}</span><span class="discount-price">${rupiah(p.price)}</span></div><div class="product-actions"><button class="btn btn-primary account-order-btn" data-account-qty="${p.qty}">Order Sekarang</button></div></div></article>`);
 });
}

const accountDescription=`<strong>Akun Shopee Premium</strong><ul><li>Akun sudah berisi followers Indonesia aktif.</li><li>Akun belum didaftarkan ke Toko Shopee, sehingga Anda bisa mendaftarkannya sendiri.</li><li>Usia akun bervariatif mulai dari 1 Bulan–8 Tahun (tergantung stock yang tersedia).</li><li>Setelah pembelian, Anda bisa langsung mengganti E-mail dan Password.</li><li>Akun belum tertaut oleh Nomor Handphone. Anda bisa melakukan verifikasi dengan nomor handphone.</li></ul>`;

const modal=document.getElementById('checkoutModal');
const closeModal=()=>{modal.classList.remove('show');modal.setAttribute('aria-hidden','true');document.body.style.overflow=''};
const openModal=(qty)=>{select.value=String(qty);document.getElementById('selectedProduct').value=qty;updateCheckoutDetails(qty);modal.classList.add('show');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';document.getElementById('shopeeLink').focus()};
const openAccountModal=(qty)=>{document.getElementById('selectedProduct').value='account:'+qty;document.getElementById('modalTitle').textContent=`Order Akun Shopee ${qty.toLocaleString('id-ID')} Followers`;select.innerHTML=accountProducts.map(p=>`<option value="account:${p.qty}">${p.qty.toLocaleString('id-ID')} Followers — ${rupiah(p.price)}</option>`).join('');select.value=`account:${qty}`;document.getElementById('checkoutDescription').innerHTML=accountDescription;document.getElementById('orderTotal').textContent=rupiah(accountProducts.find(x=>x.qty===qty).price);modal.classList.add('show');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';document.getElementById('shopeeLink').focus()};
const updateCheckoutDetails=(qty)=>{const p=products.find(x=>x.qty===Number(qty));if(!p)return;document.getElementById('orderTotal').textContent=rupiah(p.price);document.getElementById('checkoutDescription').innerHTML=`<strong>Followers Shopee REAL-HUMAN Permanent</strong><ul><li>Estimasi Pengerjaan 1 Jam–48 Jam.</li><li>Pengerjaan dilakukan Otomatis.</li><li>Metode hanya membutuhkan Username atau LINK Profile.</li></ul><p class="product-warning">⚠️ <strong>Mohon untuk tidak mengubah Username atau informasi terkait profil akun setelah melakukan checkout.</strong> ⚠️</p><p class="product-admin">Anda bisa menghubungi <strong>ADMIN</strong> melalui WhatsApp jika Anda telah melakukan pesanan.</p>`};
document.addEventListener('click',e=>{const btn=e.target.closest('.order-btn');if(btn)openModal(Number(btn.dataset.qty));const abtn=e.target.closest('.account-order-btn');if(abtn)openAccountModal(Number(abtn.dataset.accountQty));if(e.target.matches('[data-close]'))closeModal()});select.addEventListener('change',()=>{const value=select.value;if(value.startsWith('account:')){const qty=Number(value.split(':')[1]);const p=accountProducts.find(x=>x.qty===qty);document.getElementById('modalTitle').textContent=`Order Akun Shopee ${qty.toLocaleString('id-ID')} Followers`;document.getElementById('checkoutDescription').innerHTML=accountDescription;document.getElementById('orderTotal').textContent=rupiah(p.price);}else{document.getElementById('modalTitle').textContent='Order Followers Shopee';updateCheckoutDetails(Number(value));}});
document.getElementById('checkoutForm').addEventListener('submit',e=>{e.preventDefault();const value=select.value;const wa=document.getElementById('customerWa').value.trim();const link=document.getElementById('shopeeLink').value.trim();const notes=document.getElementById('notes').value.trim();let text='';if(value.startsWith('account:')){const qty=Number(value.split(':')[1]);const p=accountProducts.find(x=>x.qty===qty);text=`Halo digitalEVO, saya ingin order Akun Shopee Premium.%0A%0APaket: AKUN Shopee ${p.qty} Followers%0ATotal: ${rupiah(p.price)}%0AWhatsApp: ${encodeURIComponent(wa)}%0ALink/Username: ${encodeURIComponent(link)}%0ACatatan: ${encodeURIComponent(notes||'-')}`;}else{const p=products.find(x=>x.qty===Number(value));text=`Halo digitalEVO, saya ingin order Followers Shopee.%0A%0APaket: ${p.qty} Followers%0ATotal: ${rupiah(p.price)}%0AWhatsApp: ${encodeURIComponent(wa)}%0ALink Shopee: ${encodeURIComponent(link)}%0ACatatan: ${encodeURIComponent(notes||'-')}`;}window.open(`https://wa.me/6285185353434?text=${text}`,'_blank','noopener');closeModal()});
document.querySelector('.menu-toggle').addEventListener('click',()=>{const n=document.getElementById('mainNav');const b=document.querySelector('.menu-toggle');n.classList.toggle('open');b.setAttribute('aria-expanded',n.classList.contains('open'))});document.querySelectorAll('.nav a').forEach(a=>a.addEventListener('click',()=>document.getElementById('mainNav').classList.remove('open')));document.getElementById('year').textContent=new Date().getFullYear();

// Daily sales counter: sequentially moves from 64 to 103 over the local 24-hour day, then resets.
(function initDailySalesCounter(){
  const el=document.getElementById('salesCount');
  if(!el) return;

  const START=64, END=103;
  const DAY=24*60*60*1000;
  const INCREMENTS=END-START;

  // Fixed, varied intervals make the changes feel organic while remaining identical for every visitor.
  // The offsets are normalized to a full 24-hour cycle, so the counter resets at local midnight.
  const seed=(n)=>{const x=Math.sin(n*12.9898)*43758.5453;return x-Math.floor(x)};
  const weights=Array.from({length:INCREMENTS},(_,i)=>0.65+seed(i+17)*0.85);
  const total=weights.reduce((a,b)=>a+b,0);
  const offsets=[];
  let cumulative=0;
  for(let i=0;i<weights.length;i++){
    cumulative+=weights[i]/total*DAY;
    offsets.push(cumulative);
  }

  const elapsedToday=()=>{
    const now=new Date();
    return now.getHours()*3600000+now.getMinutes()*60000+now.getSeconds()*1000+now.getMilliseconds();
  };

  let last=START;
  const render=(value,animate=true)=>{
    if(value===last && el.textContent===String(value)) return;
    if(animate){
      el.style.opacity='0.35';
      el.style.transform='translateY(-2px)';
      setTimeout(()=>{
        el.textContent=String(value);
        el.style.opacity='1';
        el.style.transform='translateY(0)';
      },140);
    }else{
      el.textContent=String(value);
      el.style.opacity='1';
      el.style.transform='translateY(0)';
    }
    last=value;
  };

  const update=()=>{
    const elapsed=elapsedToday();
    let value=START;
    for(let i=0;i<offsets.length;i++){
      if(elapsed>=offsets[i]) value=START+i+1;
      else break;
    }
    render(Math.min(END,value),true);
  };

  render(START,false);
  update();
  setInterval(update,5000);
})();
