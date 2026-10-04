import {env} from 'cloudflare:workers';
import {database,distributorHasAccess} from '@/lib/commercial';
import JoinSupplier from './join-supplier';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{code:string}>}){
 const {code}=await params;
 const supplier=/^[a-f0-9]{32}$/.test(code)?await database().prepare('SELECT id,name,default_price_cents FROM app_distributors WHERE invite_code=?').bind(code).first<{id:number;name:string;default_price_cents:number}>():null;
 if(!supplier||!await distributorHasAccess(supplier.id))return <main className="gc-app"><section className="gc-login"><h1>Supplier unavailable</h1><p>Ask your water supplier for a current invitation link.</p></section></main>;
 return <JoinSupplier code={code} name={supplier.name} price={supplier.default_price_cents} siteKey={env.TURNSTILE_SITE_KEY??''}/>;
}
