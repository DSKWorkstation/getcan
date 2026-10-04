'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellRing, Check, Minus, Plus, Truck, Wallet, X } from 'lucide-react';
import Image from 'next/image';
import InstallApp from '@/components/install-app';
import LanguageSelect from '@/components/language-select';
import { tx, type Language } from '@/components/labels';
import { enablePush, pushEnabled, pushSupported } from '@/components/push-alerts';
import UpiPay from '@/components/upi-pay';

type Order = { id: number; quantity: number; price_cents: number; status: string; created_at: string };
type Data = {
  customer: { name: string; address: string; usualQuantity: number };
  distributor: { name: string; default_price_cents: number; upi_id?: string };
  orders: Order[];
  account?: { balanceCents: number; cansOut: number };
  pushKey?: string | null;
};
const statusText: Record<string, string> = { requested: 'Awaiting delivery', accepted: 'Awaiting delivery', out_for_delivery: 'On the way · Will be delivered soon', delivered: 'Delivered' };
const changeable = (status: string) => status === 'requested' || status === 'accepted';
const rupees = (cents: number) => `₹${(cents / 100).toLocaleString('en-IN')}`;

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem('getcan-language');
    if (saved === 'en' || saved === 'ta' || saved === 'hi') return saved;
  } catch { /* storage can be unavailable */ }
  const browser = typeof navigator === 'undefined' ? '' : navigator.language.toLowerCase();
  return browser.startsWith('ta') ? 'ta' : browser.startsWith('hi') ? 'hi' : 'en';
}

export default function CustomerRequest({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [lang, setLang] = useState<Language>('en');
  const [quantity, setQuantity] = useState(2);
  const [edited, setEdited] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [alertsOn, setAlertsOn] = useState(false);
  const lastStatus = useRef<string | null>(null);
  const t = (english: string) => tx(lang, english);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/commercial/request/${token}`, { cache: 'no-store' });
      const result = await response.json() as Data & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'This link is unavailable.');
      setData(result); setError('');
      if (!edited) setQuantity(result.customer.usualQuantity);
      const open = result.orders.find(o => o.status !== 'delivered');
      // Announce the moment the distributor dispatches the order.
      if (lastStatus.current && lastStatus.current !== 'out_for_delivery' && open?.status === 'out_for_delivery') {
        setNotice('Your water is on the way!'); navigator.vibrate?.([200, 100, 200]);
      }
      lastStatus.current = open?.status ?? 'none';
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open your order.'); }
  }, [token, edited]);

  useEffect(() => {
    const first = setTimeout(() => {
      setLang(initialLanguage());
      void pushEnabled().then(setAlertsOn);
      // Remember this page on the device so delivery alerts open it.
      navigator.serviceWorker?.ready.then(r => r.active?.postMessage({ type: 'customer-page', url: `/c/${token}` })).catch(() => {});
    }, 0);
    return () => clearTimeout(first);
  }, [token]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 30000);
    const wake = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', wake);
    return () => { clearTimeout(first); clearInterval(timer); document.removeEventListener('visibilitychange', wake); };
  }, [load]);

  async function send(method: 'POST' | 'PATCH' | 'DELETE', body: unknown, success: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/commercial/request/${token}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Please try again.');
      setNotice(success); setEditing(false); setConfirmCancel(false); setEdited(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function turnOnAlerts() {
    if (!data?.pushKey) return;
    setBusy(true); setError('');
    try { await enablePush(data.pushKey, token); setAlertsOn(true); setNotice('Delivery alerts are on'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not turn on alerts.'); }
    finally { setBusy(false); }
  }
  function chooseLanguage(value: Language) {
    setLang(value);
    try { localStorage.setItem('getcan-language', value); } catch { /* ignore */ }
  }

  const open = data?.orders.find(o => o.status !== 'delivered');
  const shown = open && !editing ? open.quantity : quantity;
  const price = open?.price_cents ?? data?.distributor.default_price_cents ?? 0;
  const locked = !!open && !editing;
  const balance = data?.account?.balanceCents ?? 0;
  const upi = data?.distributor.upi_id;
  const recent = data?.orders.filter(o => o.status === 'delivered').slice(0, 5) ?? [];
  const cans = (n: number) => `${n} ${t(n === 1 ? 'can' : 'cans')}`;

  return <main className="gc-app gc-customer"><header className="gc-header"><span className="gc-brand"><img src="/watercan.png" width="36" height="36" alt=""/> getcan<span>.</span></span>
    <div className="gc-customer-head-actions"><LanguageSelect label={t('Language')} value={lang} onChange={chooseLanguage}/><InstallApp start={`/c/${token}`} visible={!!data}/></div></header>
    <section className="gc-order-screen"><div className="gc-order-head"><span className="gc-eyebrow">{data?.distributor.name ?? 'GETCAN'}</span><h1>{data ? t('Order water cans') : t('Opening your order…')}</h1></div>
      {notice && <div className="gc-notice" role="status"><Check size={19}/> {t(notice)}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
      {error && <div className="gc-alert" role="alert">{error}</div>}
      {data && <><div className="gc-order-product"><div className="gc-order-copy"><span className="gc-eyebrow">{t('20 LITRE DRINKING WATER')}</span><h2>{cans(shown)}</h2><p>{open && !editing ? t('Your order is in progress') : t('Set the number you need')}</p>
        <div className="gc-order-quantity"><button disabled={quantity <= 1 || locked} onClick={() => { setEdited(true); setQuantity(q => q - 1); }} aria-label="Remove one can"><Minus size={22}/></button><strong>{shown}</strong><button disabled={quantity >= 50 || locked} onClick={() => { setEdited(true); setQuantity(q => q + 1); }} aria-label="Add one can"><Plus size={22}/></button></div>
        <strong className="gc-order-amount">{rupees(shown * price)}</strong><small>{rupees(price)} {t('per can')} · {data.customer.address || t('Delivery to your saved address')}</small></div>
        {editing ? <div className="gc-order-can gc-order-edit"><button className="gc-primary" disabled={busy} onClick={() => void send('PATCH', { id: open!.id, quantity }, 'Order updated.')}><Check size={19}/>{t('Save change')}</button><button className="gc-quiet" disabled={busy} onClick={() => { setEditing(false); setEdited(false); }}>{t('Keep order')}</button></div>
          : <button className="gc-order-can" onClick={() => void send('POST', { quantity }, 'Order placed.')} disabled={busy || !!open} aria-label={`Order ${quantity} water ${quantity === 1 ? 'can' : 'cans'}`}><Image src="/watercan.png" alt="" width={320} height={320} priority/><span>{busy ? t('Placing order…') : open ? t('Order in progress') : t('Tap can to order')}</span></button>}</div>
        {open && <div className="gc-order-progress" role="status"><span><Truck size={21}/><strong>{t(statusText[open.status] ?? open.status)}</strong></span><small>{cans(open.quantity)} · #{open.id}</small>
          {changeable(open.status) && !editing && !confirmCancel && <div className="gc-order-change"><button disabled={busy} onClick={() => { setQuantity(open.quantity); setEdited(true); setEditing(true); }}>{t('Change cans')}</button><button disabled={busy} onClick={() => setConfirmCancel(true)}><X size={16}/>{t('Cancel order')}</button></div>}
          {confirmCancel && <div className="gc-order-change"><strong>{t('Cancel this order?')}</strong><button className="danger" disabled={busy} onClick={() => void send('DELETE', { id: open.id }, 'Order cancelled.')}>{t('Cancel order')}</button><button disabled={busy} onClick={() => setConfirmCancel(false)}>{t('Keep order')}</button></div>}</div>}
        <div className="gc-customer-account"><h2><Wallet size={20}/>{t('Your account')}</h2><div className="gc-daily-summary"><div><small>{t(balance < 0 ? 'Advance paid' : 'Amount due')}</small><strong>{rupees(Math.abs(balance))}</strong></div><div><small>{t('Empty cans with you')}</small><strong>{data.account?.cansOut ?? 0}</strong></div></div>
          <div className="gc-customer-account-actions">{upi && balance > 0 && <UpiPay upiId={upi} payee={data.distributor.name} amountCents={balance} t={t}/>}
            {data.pushKey && pushSupported() && (alertsOn ? <span className="gc-alerts-on"><BellRing size={17}/>{t('Delivery alerts are on')}</span> : <button className="gc-quiet" disabled={busy} onClick={() => void turnOnAlerts()}><Bell size={17}/>{t('Get delivery alerts')}</button>)}</div>
          {recent.length > 0 && <><h3>{t('Recent orders')}</h3><div className="gc-list">{recent.map(o => <div key={o.id} className="gc-order"><span><strong>{cans(o.quantity)}</strong><small>{new Date(o.created_at).toLocaleDateString(lang === 'en' ? 'en-IN' : `${lang}-IN`, { day: 'numeric', month: 'short' })} · {t('Delivered')}</small></span><strong>{rupees(o.quantity * o.price_cents)}</strong></div>)}</div></>}</div></>}
    </section></main>;
}
