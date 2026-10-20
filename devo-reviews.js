(() => {
  const $ = id => document.getElementById(id);
  const list = $('devoReviewsList'); if (!list) return;
  let reviewToken = '', page = 1, totalPages = 1, rating = 5;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalizeStoreUrl = value => { const v=String(value||'').trim(); if(!v)return ''; const candidate=/^[a-z][a-z0-9+.-]*:\/\//i.test(v)?v:'https://'+v; const u=new URL(candidate); if(!['http:','https:'].includes(u.protocol))throw Error('Link toko/akun harus berupa alamat web yang valid.'); return u.href; };
  const msg = (id, text, type='') => { const el=$(id); if(el){el.textContent=text;el.dataset.type=type;} };
  function showLoginError(){
    let modal=$('devoReviewLoginPopup');
    if(!modal){modal=document.createElement('div');modal.id='devoReviewLoginPopup';modal.className='devo-review-popup';modal.innerHTML='<div class="devo-review-popup-card" role="alertdialog" aria-modal="true"><button type="button" class="devo-review-popup-close" aria-label="Tutup popup">×</button><div class="devo-review-spinner" aria-hidden="true"></div><p class="devo-review-popup-text">Memuat halaman ulasan...</p></div>';document.body.appendChild(modal);modal.querySelector('.devo-review-popup-close').addEventListener('click',()=>{modal.hidden=true;});}
    modal.hidden=false; modal.querySelector('.devo-review-spinner').hidden=false; modal.querySelector('.devo-review-popup-text').textContent='Memuat halaman ulasan...';
    window.setTimeout(()=>{if(!modal.isConnected)return;modal.querySelector('.devo-review-spinner').hidden=true;modal.querySelector('.devo-review-popup-text').textContent='Anda Harus Login Untuk Mengakses Ulasan';},5000);
  }
  function renderPagination(){
    const el=$('devoReviewPagination'); if(!el)return;
    const start=Math.max(1,Math.min(page-2,totalPages-4));
    const end=Math.min(totalPages,start+4);
    let html='';
    if(page>1) html+='<button type="button" data-page="'+(page-1)+'" aria-label="Halaman sebelumnya">‹</button>';
    for(let n=start;n<=end;n++) html+='<button type="button" data-page="'+n+'" class="'+(page===n?'active':'')+'" '+(page===n?'aria-current="page"':'')+'>'+n+'</button>';
    if(end<totalPages) html+='<span class="devo-review-ellipsis">...</span><button type="button" data-page="'+totalPages+'">'+totalPages+'</button>';
    if(page<totalPages) html+='<button type="button" data-page="'+(page+1)+'">Next</button>';
    el.innerHTML=html;
    el.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{const target=Number(b.dataset.page);if(target>=1&&target<=totalPages&&target!==page){page=target;loadReviews();}});
  }
  function ensurePhotoViewer(){
    if($('devoReviewPhotoViewer'))return;
    const viewer=document.createElement('div');
    viewer.id='devoReviewPhotoViewer';
    viewer.className='devo-review-photo-viewer';
    viewer.hidden=true;
    viewer.innerHTML='<div class="devo-review-photo-viewer-panel" role="dialog" aria-modal="true" aria-label="Pratinjau foto ulasan"><button type="button" data-viewer-close aria-label="Tutup foto" style="position:absolute;top:12px;right:14px;z-index:2;font-size:30px;line-height:1;background:rgba(0,0,0,.65);color:#fff;border:0;border-radius:50%;width:42px;height:42px;cursor:pointer">×</button><div class="devo-review-photo-viewer-stage"><img alt="Foto ulasan ukuran asli" style="display:block;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);width:auto;height:auto;object-fit:contain;transform:none!important;cursor:default"></div></div>';
    document.body.appendChild(viewer);
    const img=viewer.querySelector('img');
    let historyEntryOpen=false;
    const hideViewer=()=>{
      viewer.hidden=true;
      document.body.classList.remove('devo-photo-viewer-open');
      img.removeAttribute('src');
      historyEntryOpen=false;
    };
    const closeViewer=()=>{
      if(viewer.hidden)return;
      if(historyEntryOpen&&history.state&&history.state.devoReviewPhotoViewer){
        history.back();
      }else{
        hideViewer();
      }
    };
    viewer.addEventListener('click',e=>{
      if(e.target===viewer||e.target.closest('[data-viewer-close]'))closeViewer();
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&!viewer.hidden)closeViewer();
    });
    window.addEventListener('popstate',()=>{
      if(!viewer.hidden)hideViewer();
    });
    list.addEventListener('click',e=>{
      const button=e.target.closest('[data-photo-url]');
      if(!button)return;
      e.preventDefault();
      img.src=button.dataset.photoUrl;
      img.alt=button.dataset.photoAlt||'Foto ulasan ukuran asli';
      viewer.hidden=false;
      document.body.classList.add('devo-photo-viewer-open');
      historyEntryOpen=true;
      history.pushState({...history.state,devoReviewPhotoViewer:true},'',location.href.split('#')[0]+'#devo-review-photo');
    });
  }
  async function loadReviews(){
    try{const r=await fetch(`/api/reviews?page=${page}&limit=6`);const d=await r.json();if(!r.ok)throw Error(d.error||'Gagal memuat ulasan');
      totalPages=Math.max(1,Math.ceil((d.total||0)/6));if(page>totalPages)page=totalPages;$('devoReviewCount').textContent=`Berdasarkan ${d.total||0} ulasan`; $('devoReviewScore').textContent=`${String(d.average||'5').replace(/\.0$/, '')}/5`;
      if(!d.items?.length){list.innerHTML='<p class="devo-review-message">Belum ada ulasan yang disetujui.</p>';renderPagination();return;}
      list.innerHTML=d.items.map(x=>{const rawLink=String(x.store_url||'').trim();const hrefLink=rawLink?(/^[a-z][a-z0-9+.-]*:\/\//i.test(rawLink)?rawLink:'https://'+rawLink):'';const displayLink=hrefLink.replace(/^https?:\/\//i,'');const shortLink=displayLink.length>28?displayLink.slice(0,25)+'...':displayLink;return `<article class="devo-review-card ${x.pinned?'is-pinned':''}">${x.pinned?'<span class="devo-pinned-label">📌 <span>ULASAN DISEMATKAN</span></span>':''}<div class="devo-review-meta"><h3>${esc(x.name)}${rawLink?` <a class="devo-review-store-link" href="${esc(hrefLink)}" target="_blank" rel="noopener noreferrer" title="${esc(displayLink)}">${esc(shortLink)}</a>`:''}</h3></div><div class="devo-stars" aria-label="Rating ${Number(x.rating)||5} dari 5">${'★'.repeat(Math.max(1,Math.min(5,Number(x.rating)||5)))}${'☆'.repeat(5-Math.max(1,Math.min(5,Number(x.rating)||5)))}</div><p>${esc(x.body)}</p>${(Array.isArray(x.photo_urls)&&x.photo_urls.length?x.photo_urls:(x.photo_url?[x.photo_url]:[])).length?`<div class="devo-review-photo-gallery">${(Array.isArray(x.photo_urls)&&x.photo_urls.length?x.photo_urls:(x.photo_url?[x.photo_url]:[])).map((photo,i)=>`<button type="button" class="devo-review-photo-button" data-photo-url="${esc(photo)}" data-photo-alt="Foto ${i+1} ulasan dari ${esc(x.name)}" aria-label="Perbesar foto ${i+1}"><img class="devo-review-photo" loading="lazy" src="${esc(photo)}" alt="Foto ${i+1} ulasan dari ${esc(x.name)}"></button>`).join('')}</div>`:''}${x.admin_reply?`<div class="devo-review-admin-reply"><strong>Balasan digitalEVO</strong><p>${esc(x.admin_reply)}</p></div>`:''}</article>`}).join('');renderPagination();
    }catch(e){list.innerHTML='<p class="devo-review-message">Ulasan belum dapat dimuat. Silakan coba lagi nanti.</p>';}
  }
  $('devoVerifyForm')?.addEventListener('submit',async e=>{e.preventDefault();const button=$('devoVerifyButton');button.disabled=true;msg('devoVerifyMessage','Memeriksa nomor dan status pembayaran...');
    try{const digits=$('devoWhatsapp').value.replace(/\D/g,'');if(digits.length<8||digits.length>15)throw Error('Masukkan nomor WhatsApp yang valid.');const r=await fetch('/api/verify-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({whatsapp:digits})});const d=await r.json();if(!r.ok)throw Error(d.error||'Nomor belum dapat diverifikasi.');reviewToken=d.token;$('devoReviewForm').hidden=false;$('devoVerifyForm').hidden=true;msg('devoReviewMessage','Nomor berhasil diverifikasi. Silakan tulis ulasan.','success');
    }catch(err){msg('devoVerifyMessage',err.message,'error');}finally{button.disabled=false;}
  });
  document.querySelectorAll('.devo-rating-picker [data-rating]').forEach(b=>b.addEventListener('click',()=>{rating=Number(b.dataset.rating);$('devoReviewRating').value=rating;document.querySelectorAll('.devo-rating-picker [data-rating]').forEach(x=>x.classList.toggle('selected',Number(x.dataset.rating)<=rating));}));
  document.querySelectorAll('.devo-rating-picker [data-rating]').forEach(x=>x.classList.toggle('selected',Number(x.dataset.rating)<=rating));
  $('devoReviewForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!reviewToken){msg('devoReviewMessage','Silakan verifikasi nomor WhatsApp terlebih dahulu.','error');return;}const button=$('devoReviewSubmit'),files=Array.from($('devoReviewPhoto').files||[]);if(files.length>3){msg('devoReviewMessage','Maksimal 3 foto untuk setiap ulasan.','error');return;}if(files.some(file=>file.size>3*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))){msg('devoReviewMessage','Setiap foto harus JPG, PNG, atau WebP dengan ukuran maksimal 3 MB.','error');return;}button.disabled=true;msg('devoReviewMessage','Mengirim ulasan...');
    try{const form=new FormData();form.append('token',reviewToken);form.append('name',$('devoReviewName').value.trim());form.append('store_url',normalizeStoreUrl($('devoReviewLink').value));form.append('rating',String(rating));form.append('body',$('devoReviewBody').value.trim());files.forEach(file=>form.append('photo',file));const r=await fetch('/api/submit-review',{method:'POST',body:form});const d=await r.json();if(!r.ok)throw Error(d.error||'Ulasan gagal dikirim.');$('devoReviewForm').reset();$('devoReviewForm').hidden=true;msg('devoVerifyMessage','Ulasan dikirim dan menunggu persetujuan admin.','success');$('devoVerifyForm').hidden=false;reviewToken='';rating=5;document.querySelectorAll('.devo-rating-picker [data-rating]').forEach(x=>x.classList.toggle('selected',Number(x.dataset.rating)<=5));msg('devoVerifyMessage','Ulasan berhasil dikirim dan menunggu persetujuan admin.','success');
    }catch(err){msg('devoReviewMessage',err.message,'error');}finally{button.disabled=false;}
  });
  ensurePhotoViewer();
  loadReviews();
})();
