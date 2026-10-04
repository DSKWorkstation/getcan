import { activeDistributorId, database, jsonError, positiveInt, randomToken, sha256 } from '@/lib/commercial';
export async function POST(request: Request) {
 if(request.headers.get('origin')!==new URL(request.url).origin)return jsonError('Invalid request origin.',403);
 const owner=await activeDistributorId(request); if(!owner)return jsonError('Sign in to share a customer link.',401);
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;const id=positiveInt(body?.id,2147483647);
 if(!id)return jsonError('Choose a customer.',400);
 const customer=await database().prepare('SELECT id FROM app_customers WHERE id=? AND distributor_id=?').bind(id,owner).first();
 if(!customer)return jsonError('Customer not found.',404);
 const token=randomToken();
 await database().prepare('INSERT OR IGNORE INTO app_customer_links (customer_id,distributor_id,token,token_hash) VALUES (?,?,?,?)').bind(id,owner,token,await sha256(token)).run();
 const link=await database().prepare('SELECT token FROM app_customer_links WHERE customer_id=? AND distributor_id=?').bind(id,owner).first<{token:string}>();
 return Response.json({requestLink:`${new URL(request.url).origin}/c/${link!.token}`},{headers:{'Cache-Control':'no-store'}});
}
