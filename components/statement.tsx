'use client';
import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { tx, type Language } from '@/components/labels';

type Data = {
  month: string; customer: { name: string; phone: string; address: string }; distributor: { name: string; upiId: string };
  openingBalanceCents: number; chargedCents: number; paidCents: number; closingBalanceCents: number;
  openingCans: number; cansDelivered: number; cansReturned: number; closingCans: number;
  deliveries: { id: number; quantity: number; price_cents: number; returned_cans: number; at: string }[];
  payments: { id: number; amount_cents: number; method: string; at: string }[];
  collections: { id: number; quantity: number; at: string }[];
};
const rupees = (cents: number) => `₹${(cents / 100).toLocaleString('en-IN')}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const thisMonth = () => new Date(Date.now() + 19800000).toISOString().slice(0, 7);

export default function Statement({ customer, lang, onClose }: { customer: { id: number; name: string }; lang: Language; onClose: () => void }) {
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const t = (english: string) => tx(lang, english);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/commercial/statement?customerId=${customer.id}&month=${month}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { const body = await response.json() as Data & { error?: string }; if (!response.ok) throw new Error(body.error ?? 'Could not load the statement.'); setData(body); setError(''); })
      .catch(e => { if (!controller.signal.aborted) { setData(null); setError(e instanceof Error ? e.message : 'Could not load the statement.'); } });
    return () => controller.abort();
  }, [customer.id, month]);

  const label = new Date(`${month}-15T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const rows = data ? [
    ...data.deliveries.map(d => ({ at: d.at, text: `${d.quantity} cans delivered${d.returned_cans ? ` · ${d.returned_cans} empties back` : ''}`, amount: d.quantity * d.price_cents })),
    ...data.payments.map(p => ({ at: p.at, text: `Payment · ${p.method.toUpperCase()}`, amount: -p.amount_cents })),
    ...data.collections.map(c => ({ at: c.at, text: `${c.quantity} empty cans collected`, amount: 0 })),
  ].sort((a, b) => a.at.localeCompare(b.at)) : [];
  const message = data ? [
    `${data.distributor.name} · statement for ${label}`, `${data.customer.name}`,
    `Opening balance: ${rupees(data.openingBalanceCents)}`, `Water: ${data.cansDelivered} cans · ${rupees(data.chargedCents)}`, `Paid: ${rupees(data.paidCents)}`,
    `${data.closingBalanceCents < 0 ? 'Advance' : 'Amount due'}: ${rupees(Math.abs(data.closingBalanceCents))}`, `Empty cans with you: ${data.closingCans}`,
    ...(data.distributor.upiId && data.closingBalanceCents > 0 ? [`Pay by UPI: ${data.distributor.upiId}`] : []),
  ].join('\n') : '';

  return <div className="gc-overlay" onClick={onClose}><section className="gc-dialog gc-statement" role="dialog" aria-modal="true" aria-label={t('Statement')} onClick={e => e.stopPropagation()}>
    <button className="gc-close" onClick={onClose} aria-label="Close">×</button>
    <span className="gc-eyebrow">{data?.distributor.name ?? ''}</span><h2>{t('Statement')} · {customer.name}</h2>
    <label className="no-print">{label}<input type="month" value={month} max={thisMonth()} onChange={e => e.target.value && setMonth(e.target.value)}/></label>
    {error && <p className="quick-error" role="alert">{error}</p>}
    {data && <>
      <div className="gc-statement-totals">
        <div><small>{t('Opening balance')}</small><strong>{rupees(data.openingBalanceCents)}</strong></div>
        <div><small>{t('Charges')}</small><strong>{rupees(data.chargedCents)}</strong></div>
        <div><small>{t('Payments')}</small><strong>{rupees(data.paidCents)}</strong></div>
        <div><small>{t(data.closingBalanceCents < 0 ? 'Credit' : 'Closing balance')}</small><strong>{rupees(Math.abs(data.closingBalanceCents))}</strong></div>
        <div><small>{t('Cans delivered')}</small><strong>{data.cansDelivered}</strong></div>
        <div><small>{t('Cans with customers')}</small><strong>{data.closingCans}</strong></div>
      </div>
      <table><thead><tr><th>Date</th><th>Entry</th><th>Amount</th></tr></thead><tbody>
        {rows.map((row, i) => <tr key={i}><td>{day(row.at)}</td><td>{row.text}</td><td>{row.amount ? rupees(row.amount) : '—'}</td></tr>)}
        {!rows.length && <tr><td colSpan={3}>No activity this month.</td></tr>}
      </tbody></table>
      <div className="delivery-share-actions no-print">
        <a className="gc-primary" href={`https://wa.me/91${data.customer.phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <button className="gc-quiet" onClick={() => window.print()}><Printer size={17}/>{t('Print')}</button>
      </div>
    </>}
  </section></div>;
}
