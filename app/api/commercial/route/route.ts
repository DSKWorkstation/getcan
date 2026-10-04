import { activeDistributorId, database, jsonError } from '@/lib/commercial';
export async function POST(request: Request) {
 if(request.headers.get('origin')!==new URL(request.url).origin)return jsonError('Invalid request origin.',403);
 const owner=await activeDistributorId(request);if(!owner)return jsonError('Sign in to manage deliveries.',401);
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
 if(body?.action!=='start'||typeof body.area!=='string'||body.area.length>80)return jsonError('Choose an area.',400);
 const result=await database().prepare("UPDATE app_orders SET status='out_for_delivery',updated_at=? WHERE distributor_id=? AND status IN ('requested','accepted') AND customer_id IN (SELECT id FROM app_customers WHERE distributor_id=? AND lower(trim(area))=lower(trim(?)))").bind(new Date().toISOString(),owner,owner,body.area).run();
 return Response.json({started:result.meta.changes});
}
