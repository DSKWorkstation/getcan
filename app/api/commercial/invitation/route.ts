import {activeDistributorId,database,jsonError,randomToken} from '@/lib/commercial';
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return jsonError('Invalid request origin.',403);
 const owner=await activeDistributorId(request);if(!owner)return jsonError('Sign in to share your supplier page.',401);
 await database().prepare('UPDATE app_distributors SET invite_code=? WHERE id=? AND invite_code IS NULL').bind(randomToken().slice(0,32),owner).run();
 const row=await database().prepare('SELECT invite_code FROM app_distributors WHERE id=?').bind(owner).first<{invite_code:string}>();
 return Response.json({inviteLink:`${new URL(request.url).origin}/join/${row!.invite_code}`},{headers:{'Cache-Control':'no-store'}});
}
