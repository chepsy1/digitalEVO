function json(res, status, body) {
  return res.status(status).json(body);
}

async function supabaseFetch(path, options={}) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.');
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res,405,{error:'Method not allowed'});

  try {
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return json(res,401,{error:'Sesi admin tidak ditemukan.'});

    const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const userResponse = await fetch(`${base}/auth/v1/user`, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${token}`
      }
    });
    if (!userResponse.ok) return json(res,401,{error:'Sesi admin tidak valid.'});
    const user = await userResponse.json();

    const adminResponse = await supabaseFetch(`/rest/v1/admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
    const admins = await adminResponse.json();
    if (!adminResponse.ok || !admins?.length) return json(res,403,{error:'Akses admin ditolak.'});

    const {productId, quantity=1} = req.body || {};
    if (productId === undefined || productId === null || String(productId).trim() === '') {
      return json(res,400,{error:'Pilih produk terlebih dahulu.'});
    }

    // products.id dan orders.product_id adalah UUID. Beberapa versi frontend lama
    // pernah mengirim angka seperti "5" (sort_order) sehingga PostgREST menolak
    // nilai tersebut dengan "invalid input syntax for type uuid". Terima keduanya,
    // tetapi selalu gunakan UUID asli dari database saat membuat order.
    const rawProductId = String(productId).trim();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    let productResponse;

    if (uuidPattern.test(rawProductId)) {
      productResponse = await supabaseFetch(
        `/rest/v1/products?id=eq.${encodeURIComponent(rawProductId)}&select=id,category,qty,price,sort_order`
      );
    } else if (/^\d+$/.test(rawProductId)) {
      // Backward compatibility: angka diperlakukan sebagai sort_order.
      productResponse = await supabaseFetch(
        `/rest/v1/products?sort_order=eq.${encodeURIComponent(rawProductId)}&select=id,category,qty,price,sort_order&order=category.asc`
      );
    } else {
      return json(res,400,{error:'ID produk tidak valid. Silakan refresh halaman admin lalu coba lagi.'});
    }

    const products = await productResponse.json();
    const product = products?.[0];
    if (!product) return json(res,404,{error:'Produk tidak ditemukan. Silakan refresh daftar produk admin.'});

    const qty = Math.max(1, Number(quantity) || 1);
    const invoice = `ADM-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random()*900+100)}`;

    const order = {
      transaction_id: invoice,
      product_id: product.id,
      product_name: product.category === 'account'
        ? `Akun Shopee ${Number(product.qty).toLocaleString('id-ID')} Followers`
        : `${Number(product.qty).toLocaleString('id-ID')} Followers`,
      category: product.category,
      quantity: qty,
      amount: 0,
      payment_status: 'paid',
      order_status: 'completed',
      payment_method: 'ADMIN_FREE',
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const insert = await supabaseFetch('/rest/v1/orders', {
      method:'POST',
      headers:{Prefer:'return=representation'},
      body:JSON.stringify(order)
    });
    const data = await insert.json();
    if (!insert.ok) return json(res,500,{error:data?.message || data?.hint || 'Gagal menyimpan free checkout.'});

    return json(res,200,{success:true,invoice,product_name:order.product_name});
  } catch (error) {
    return json(res,500,{error:error.message || 'Server error'});
  }
}
