import type { Metadata } from 'next';
import CustomerRequest from './request';

export const dynamic = 'force-dynamic';
export async function generateMetadata({params}:{params:Promise<{token:string}>}):Promise<Metadata>{
 const {token}=await params;
 return {manifest:/^[a-f0-9]{64}$/.test(token)?`/api/app-manifest?start=${encodeURIComponent('/c/'+token)}`:'/api/app-manifest',referrer:'no-referrer'};
}


export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CustomerRequest token={token} />;
}
