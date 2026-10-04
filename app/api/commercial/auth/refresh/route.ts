import { database, distributorId, jsonError, sessionCookie, sha256 } from '@/lib/commercial';
export async function POST(request: Request) {
 if (request.headers.get('origin') !== new URL(request.url).origin) return jsonError('Invalid request origin.',403);
 const owner=await distributorId(request),token=sessionCookie(request);
 if(!owner||!token)return jsonError('Sign in to continue.',401);
 const expires=new Date(Date.now()+180*86400000).toISOString();
 await database().prepare('UPDATE app_sessions SET expires_at=? WHERE token_hash=? AND distributor_id=?').bind(expires,await sha256(token),owner).run();
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':`getcan_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=15552000`}});
}
