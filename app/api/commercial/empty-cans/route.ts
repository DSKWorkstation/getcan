import {activeDistributorId,database,jsonError,positiveInt} from '@/lib/commercial';
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return jsonError('Invalid request origin.',403);
 const owner=await activeDistributorId(request);if(!owner)return jsonError('Sign in to collect cans.',401);
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
 const id=positiveInt(body?.customerId,2147483647),quantity=positiveInt(body?.quantity,1000),receipt=String(body?.receipt??'');
 if(!id||!quantity||! /^[a-f0-9-]{36}$/.test(receipt))return jsonError('Choose the number of empty cans.',400);
 const existing=await database().prepare('SELECT id FROM app_can_collections WHERE receipt=? AND distributor_id=? AND customer_id=?').bind(receipt,owner,id).first();if(existing)return Response.json({ok:true});
 const result=await database().prepare(`INSERT OR IGNORE INTO app_can_collections (distributor_id,customer_id,quantity,receipt,created_at) SELECT ?,id,?,?,? FROM app_customers c WHERE c.id=? AND c.distributor_id=? AND ? <= COALESCE((SELECT SUM(quantity-returned_cans) FROM app_orders WHERE customer_id=c.id AND distributor_id=? AND status='delivered'),0)-COALESCE((SELECT SUM(quantity) FROM app_can_collections WHERE customer_id=c.id AND distributor_id=?),0)`).bind(owner,quantity,receipt,new Date().toISOString(),id,owner,quantity,owner,owner).run();
 if(!result.meta.changes)return jsonError('Collection exceeds cans outstanding. Refresh and check.',409);
 return Response.json({ok:true});
}
