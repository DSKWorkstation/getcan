import {ledger} from '@/lib/ledger';
import { database, distributorId, jsonError } from '@/lib/commercial';
export async function GET(request: Request) {
 const owner=await distributorId(request);
 if(!owner)return jsonError('Sign in to open your desk.',401);
 const db=database(),now=new Date().toISOString();
 const [distributor,subscription]=await Promise.all([
  db.prepare('SELECT name,default_price_cents,created_at FROM app_distributors WHERE id=?').bind(owner).first<{name:string;default_price_cents:number;created_at:string}>(),
  db.prepare('SELECT status,current_end_at,checkout_url FROM app_subscriptions WHERE distributor_id=?').bind(owner).first<{status:string;current_end_at:string|null;checkout_url:string|null}>()
 ]);
 if(!distributor)return jsonError('Sign in to open your desk.',401);
 const trialEnd=new Date(Date.parse(distributor.created_at)+60*86400000).toISOString();
 const trial=trialEnd>now,subActive=subscription?.status==='active'&&(!subscription.current_end_at||subscription.current_end_at>now);
 const billing={status:trial||subActive?'active':subscription?.status??'not_started',trialEnd:trial?trialEnd:null,currentEndAt:trial?trialEnd:subscription?.current_end_at??null,checkoutUrl:trial?null:subscription?.checkout_url??null};
 const headers={'Cache-Control':'no-store','Vary':'Cookie'};
 if(!trial&&!subActive)return Response.json({billing},{headers});
 const [customers,orders,payments,accounts]=await Promise.all([
  db.prepare('SELECT id,name,phone,address,area,usual_quantity,frequency_days,last_delivered_at FROM app_customers WHERE distributor_id=? ORDER BY updated_at DESC LIMIT 500').bind(owner).all(),
  db.prepare('SELECT o.*,c.name AS customer,c.phone,c.address,c.area FROM app_orders o JOIN app_customers c ON c.id=o.customer_id AND c.distributor_id=o.distributor_id WHERE o.distributor_id=? ORDER BY o.id DESC LIMIT 500').bind(owner).all(),
  db.prepare('SELECT id,customer_id,amount_cents FROM app_payments WHERE distributor_id=? ORDER BY id DESC LIMIT 500').bind(owner).all(),
  ledger(owner)
 ]);
 return Response.json({billing,settings:{name:distributor.name,default_price_cents:distributor.default_price_cents},customers:customers.results,orders:orders.results,payments:payments.results,...accounts},{headers});
}
