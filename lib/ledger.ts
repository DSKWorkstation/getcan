import { database } from '@/lib/commercial';
export const indiaDay=()=>new Date(Date.now()+19800000).toISOString().slice(0,10);
export async function ledger(owner:number){
 const db=database(),day=indiaDay();
 const [balances,sales,receipts,returns]=await Promise.all([
 db.prepare(`SELECT c.id AS customer_id,
 COALESCE((SELECT SUM(quantity*price_cents) FROM app_orders WHERE customer_id=c.id AND distributor_id=? AND status='delivered'),0)-COALESCE((SELECT SUM(amount_cents) FROM app_payments WHERE customer_id=c.id AND distributor_id=?),0) AS balance_cents,
 COALESCE((SELECT SUM(quantity-returned_cans) FROM app_orders WHERE customer_id=c.id AND distributor_id=? AND status='delivered'),0)-COALESCE((SELECT SUM(quantity) FROM app_can_collections WHERE customer_id=c.id AND distributor_id=?),0) AS cans_out
 FROM app_customers c WHERE c.distributor_id=?`).bind(owner,owner,owner,owner,owner).all<{customer_id:number;balance_cents:number;cans_out:number}>(),
 db.prepare("SELECT COALESCE(SUM(quantity*price_cents),0) AS sales_cents,COALESCE(SUM(quantity),0) AS delivered_cans,COALESCE(SUM(returned_cans),0) AS returned_cans FROM app_orders WHERE distributor_id=? AND status='delivered' AND date(updated_at,'+5 hours','+30 minutes')=?").bind(owner,day).first<{sales_cents:number;delivered_cans:number;returned_cans:number}>(),
 db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS collected_cents FROM app_payments WHERE distributor_id=? AND date(created_at,'+5 hours','+30 minutes')=?").bind(owner,day).first<{collected_cents:number}>(),
 db.prepare("SELECT COALESCE(SUM(quantity),0) AS quantity FROM app_can_collections WHERE distributor_id=? AND date(created_at,'+5 hours','+30 minutes')=?").bind(owner,day).first<{quantity:number}>()
 ]);
 return {balances:balances.results,summary:{day,...sales,...receipts,returned_cans:(sales?.returned_cans??0)+(returns?.quantity??0),dues_cents:balances.results.reduce((n,c)=>n+Math.max(0,c.balance_cents),0),credit_cents:balances.results.reduce((n,c)=>n+Math.max(0,-c.balance_cents),0),cans_out:balances.results.reduce((n,c)=>n+c.cans_out,0)}};
}
