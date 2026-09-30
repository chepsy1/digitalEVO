import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function formatDANA(t: Date) {
  // DANA SNAP requires Jakarta time with an explicit +07:00 offset.
  const jakartaWallClock = new Date(t.getTime() + 7 * 60 * 60 * 1000);
  return jakartaWallClock.toISOString().replace(/\.\d{3}Z$/, "+07:00");
}
function timestamp() {
  return formatDANA(new Date());
}
function id25() {
  const d = new Date();
  const stamp = d.toISOString().replace(/\D/g, "").slice(0, 14);
  const rnd = crypto.randomUUID().replaceAll("-", "").slice(0, 9);
  return `EVO${stamp}${rnd}`.slice(0, 25);
}
function pemToDer(pem: string) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0)).buffer;
}
async function sign(text: string, privateKeyPem: string) {
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ message: "Method not allowed" }, 405);

  try {
    const input = await req.json();
    const category = input.category === "account" ? "account" : "followers";
    const qty = Number(input.qty);
    if (!Number.isInteger(qty) || qty <= 0) return json({ message: "Produk tidak valid." }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: product, error: productError } = await supabase
      .from("products").select("category,qty,price").eq("category", category).eq("qty", qty).maybeSingle();
    if (productError || !product) return json({ message: "Produk tidak ditemukan." }, 404);

    const amount = Number(product.price);
    const paymentId = crypto.randomUUID();
    const partnerReferenceNo = id25();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const now = new Date();

    const row = {
      id: paymentId,
      partner_reference_no: partnerReferenceNo,
      category,
      product_qty: qty,
      amount,
      customer_whatsapp: category === "followers" ? String(input.customerWhatsapp || "").slice(0, 32) : null,
      shopee_link: category === "followers" ? String(input.shopeeLink || "").slice(0, 500) : null,
      account_contact: category === "account" ? String(input.accountContact || "").slice(0, 160) : null,
      status: "PENDING",
      expires_at: expiresAt.toISOString(),
    };
    const { error: insertError } = await supabase.from("payments").insert(row);
    if (insertError) return json({ message: insertError.message }, 500);

    const baseUrl = Deno.env.get("DANA_BASE_URL") || "https://api.sandbox.dana.id";
    const path = "/v1.0/qr/qr-mpm-generate.htm";
    const body = {
      merchantId: Deno.env.get("DANA_MERCHANT_ID"),
      partnerReferenceNo,
      amount: { value: `${amount}.00`, currency: "IDR" },
      storeId: Deno.env.get("DANA_STORE_ID") || "",
      validityPeriod: formatDANA(expiresAt),
      additionalInfo: {
        terminalSource: "MER",
        envInfo: { terminalType: "SYSTEM", orderTerminalType: "WEB" }
      }
    };
    if (!body.merchantId || !Deno.env.get("DANA_PARTNER_ID") || !Deno.env.get("DANA_PRIVATE_KEY") || !Deno.env.get("DANA_CHANNEL_ID")) {
      await supabase.from("payments").update({status:"FAILED",updated_at:new Date().toISOString()}).eq("id", paymentId);
      return json({ message: "Credential DANA belum lengkap. Periksa DANA_MERCHANT_ID, DANA_PARTNER_ID, DANA_PRIVATE_KEY, dan DANA_CHANNEL_ID di Edge Function Secrets." }, 500);
    }

    const bodyText = JSON.stringify(body);
    const ts = timestamp();
    const hash = await sha256Hex(bodyText);
    const stringToSign = `POST:${path}:${hash}:${ts}`;
    const signature = await sign(stringToSign, Deno.env.get("DANA_PRIVATE_KEY")!);
    const externalId = crypto.randomUUID().replaceAll("-", "").slice(0, 32);

    const response = await fetch(baseUrl + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TIMESTAMP": ts,
        "X-SIGNATURE": signature,
        "X-PARTNER-ID": Deno.env.get("DANA_PARTNER_ID")!,
        "X-EXTERNAL-ID": externalId,
        "CHANNEL-ID": Deno.env.get("DANA_CHANNEL_ID")!,
        ...(Deno.env.get("DANA_ORIGIN") ? { "ORIGIN": Deno.env.get("DANA_ORIGIN")! } : {}),
      },
      body: bodyText
    });
    const dana = await response.json().catch(() => ({}));

    if (!response.ok || dana.responseCode !== "2004700") {
      await supabase.from("payments").update({
        status:"FAILED", dana_payload:dana, updated_at:new Date().toISOString()
      }).eq("id", paymentId);
      return json({ message: dana.responseMessage || `DANA error (${response.status})`, danaCode:dana.responseCode }, 502);
    }

    const qrImage = dana.qrImage
      ? (String(dana.qrImage).startsWith("data:") ? dana.qrImage : `data:image/png;base64,${dana.qrImage}`)
      : null;
    await supabase.from("payments").update({
      dana_reference_no: dana.referenceNo || null,
      qr_content: dana.qrContent || null,
      qr_image: qrImage,
      qr_url: dana.qrUrl || null,
      dana_payload: dana,
      updated_at: new Date().toISOString()
    }).eq("id", paymentId);

    return json({
      paymentId,
      partnerReferenceNo,
      amount,
      qrContent: dana.qrContent || null,
      qrImage,
      qrUrl: dana.qrUrl || null,
      expiresAt: expiresAt.toISOString()
    });
  } catch (e) {
    return json({ message: e?.message || "Internal error" }, 500);
  }
});