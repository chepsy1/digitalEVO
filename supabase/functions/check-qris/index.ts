import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({message:"Method not allowed"},405);
  try{
    const {paymentId}=await req.json();
    if(!paymentId) return json({message:"paymentId wajib."},400);
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {data,error}=await db.from("payments").select("id,partner_reference_no,amount,status,expires_at,paid_at").eq("id",paymentId).maybeSingle();
    if(error||!data) return json({message:"Transaksi tidak ditemukan."},404);
    if(data.status==="PENDING" && new Date(data.expires_at).getTime()<=Date.now()){
      await db.from("payments").update({status:"EXPIRED",updated_at:new Date().toISOString()}).eq("id",paymentId).eq("status","PENDING");
      data.status="EXPIRED";
    }
    return json({paymentId:data.id,partnerReferenceNo:data.partner_reference_no,amount:data.amount,status:data.status,expiresAt:data.expires_at,paidAt:data.paid_at});
  }catch(e){return json({message:e?.message||"Internal error"},500);}
});