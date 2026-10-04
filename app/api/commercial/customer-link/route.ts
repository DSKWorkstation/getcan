import { activeDistributorId, database, jsonError, positiveInt } from '@/lib/commercial';
import { customerLink, resetCustomerLink } from '@/lib/links';
export async function POST(request: Request) {
 if(request.headers.get('origin')!==new URL(request.url).origin)return jsonError('Invalid request origin.',403);
 const owner=await activeDistributorId(request); if(!owner)return jsonError('Sign in to share a customer link.',401);
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;const id=positiveInt(body?.id,2147483647);
 if(!id)return jsonError('Choose a customer.',400);
 const customer=await database().prepare('SELECT id FROM app_customers WHERE id=? AND distributor_id=?').bind(id,owner).first();
 if(!customer)return jsonError('Customer not found.',404);
 const origin=new URL(request.url).origin;
 const requestLink=body?.reset===true?await resetCustomerLink(owner,id,origin):await customerLink(owner,id,origin);
 return Response.json({requestLink,reset:body?.reset===true},{headers:{'Cache-Control':'no-store'}});
}
