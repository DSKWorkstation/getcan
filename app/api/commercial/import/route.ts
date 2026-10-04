import {activeDistributorId,database,jsonError,phoneNumber,positiveInt,randomToken,sha256} from '@/lib/commercial';
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return jsonError('Invalid request origin.',403);
 const owner=await activeDistributorId(request);if(!owner)return jsonError('Sign in to import customers.',401);
 if(Number(request.headers.get('content-length')??0)>200000)return jsonError('Import up to 200 customers at a time.',413);
 const body=await request.json().catch(()=>null) as {customers?:Record<string,unknown>[]}|null;
 if(!Array.isArray(body?.customers)||!body.customers.length||body.customers.length>200)return jsonError('Choose 1–200 customers.',400);
 let invalid=0,duplicates=0;const seen=new Set<string>(),statements=[];const now=new Date().toISOString();
 for(const row of body.customers){const phone=phoneNumber(row?.phone),quantity=positiveInt(row?.usualQuantity??2,50),frequency=positiveInt(row?.frequencyDays??7,90);if(!phone||!quantity||!frequency){invalid++;continue;}if(seen.has(phone)){duplicates++;continue;}seen.add(phone);
 statements.push(database().prepare('INSERT OR IGNORE INTO app_customers(distributor_id,name,phone,address,area,usual_quantity,frequency_days,request_token_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(owner,String(row.name??'').trim().slice(0,80)||`Customer ${phone.slice(-4)}`,phone,String(row.address??'').trim().slice(0,240),String(row.area??'').trim().slice(0,80),quantity,frequency,await sha256(randomToken()),now,now));}
 let imported=0;for(let i=0;i<statements.length;i+=50){const result=await database().batch(statements.slice(i,i+50));imported+=result.reduce((n,x)=>n+x.meta.changes,0);}
 return Response.json({imported,invalid,skipped:duplicates+statements.length-imported});
}
