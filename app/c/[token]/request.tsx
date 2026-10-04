'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Droplets, Minus, Plus, Truck } from 'lucide-react';
import Image from 'next/image';
import InstallApp from '@/components/install-app';

type Data = { customer: { name: string; address: string; usualQuantity: number }; distributor: { name: string; default_price_cents: number }; orders: { id: number; quantity: number; price_cents: number; status: string }[] };
const statusText: Record<string, string> = { requested: 'Awaiting delivery', accepted: 'Awaiting delivery', out_for_delivery: 'Out for delivery · Will be delivered soon', delivered: 'Delivered' };

export default function CustomerRequest({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [quantity, setQuantity] = useState(2);
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/commercial/request/${token}`, { cache: 'no-store' });
      const result = await response.json() as Data & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'This link is unavailable.');
      setData(result); setError('');
      if (!edited) setQuantity(result.customer.usualQuantity);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open your order.'); }
  }, [token, edited]);
  useEffect(() => { void load(); const timer=setInterval(()=>void load(),60000); return ()=>clearInterval(timer); }, [load]);
  async function requestWater() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/commercial/request/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not place your order.');
      setSuccess(true); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not place your order.'); }
    finally { setBusy(false); }
  }
  const open = data?.orders.find(o => o.status !== 'delivered');
  return <main className="gc-app gc-customer"><header className="gc-header"><span className="gc-brand"><img src="/watercan.png" width="36" height="36" alt=""/> getcan<span>.</span></span><InstallApp start={`/c/${token}`} visible={!!data}/></header>
    <section className="gc-order-screen"><div className="gc-order-head"><span className="gc-eyebrow">{data?.distributor.name ?? 'GETCAN'}</span><h1>{data ? 'Order water cans' : 'Opening your order…'}</h1></div>
      {data && <><div className="gc-order-product"><div className="gc-order-copy"><span className="gc-eyebrow">20 LITRE DRINKING WATER</span><h2>{open ? open.quantity : quantity} {(open ? open.quantity : quantity) === 1 ? 'can' : 'cans'}</h2><p>{open ? 'Your order is in progress' : 'Set the number you need'}</p><div className="gc-order-quantity"><button disabled={quantity <= 1 || !!open} onClick={() => { setEdited(true); setQuantity(q => q - 1); }} aria-label="Remove one can"><Minus size={22}/></button><strong>{open ? open.quantity : quantity}</strong><button disabled={quantity >= 50 || !!open} onClick={() => { setEdited(true); setQuantity(q => q + 1); }} aria-label="Add one can"><Plus size={22}/></button></div><strong className="gc-order-amount">₹{(((open?.quantity ?? quantity) * (open?.price_cents ?? data.distributor.default_price_cents)) / 100).toLocaleString('en-IN')}</strong><small>₹{((open?.price_cents ?? data.distributor.default_price_cents) / 100).toLocaleString('en-IN')} per can · {data.customer.address || 'Delivery to your saved address'}</small></div><button className="gc-order-can" onClick={requestWater} disabled={busy || !!open} aria-label={`Order ${quantity} water ${quantity === 1 ? 'can' : 'cans'}`}><Image src="/watercan.png" alt="" width={320} height={320} priority/><span>{busy ? 'Placing order…' : open ? 'Order in progress' : 'Tap can to order'}</span></button></div>{open && <div className="gc-order-progress" role="status"><span><Truck size={21}/><strong>{statusText[open.status] ?? open.status}</strong></span><small>{open.quantity} {open.quantity === 1 ? 'can' : 'cans'} · Order #{open.id}</small></div>}{success && <div className="gc-notice" role="status"><Check size={19}/> Order placed with {data.distributor.name}.</div>}</>}
      {error && <div className="gc-alert" role="alert">{error}</div>}
    </section></main>;
}
