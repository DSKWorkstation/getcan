'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, ContactRound, Minus, Plus, Search, X } from 'lucide-react';

type Person = { id: number; name: string; phone: string; address?: string; area?: string; usual_quantity: number };
type Result = { id: number; newCustomer: boolean; requestLink?: string | null };
type Props = { endpoint: string; lookupEndpoint?: string; people: Person[]; priceCents: number; onDone: (result: Result, phone: string) => Promise<void> | void; onClose: () => void; initialPhone?: string; lang?: 'en' | 'ta' | 'hi'; saveOnly?: boolean };
const copy = {
  en: { title: 'New order', phone: 'Find customer', placeholder: 'Name or 10-digit mobile', contacts: 'Contacts', recent: 'Recent customers', found: 'Existing customer', new: 'New customer', name: 'Name (optional)', address: 'Address (optional)', cans: 'Cans', total: 'Total', place: 'Place order', sending: 'Placing…', hint: 'Type a number or choose a contact.', saved: 'Usual order', close: 'Close' },
  ta: { title: 'புதிய ஆர்டர்', phone: 'வாடிக்கையாளரைத் தேடு', placeholder: 'பெயர் அல்லது மொபைல் எண்', contacts: 'தொடர்புகள்', recent: 'சமீபத்திய வாடிக்கையாளர்கள்', found: 'ஏற்கனவே உள்ள வாடிக்கையாளர்', new: 'புதிய வாடிக்கையாளர்', name: 'பெயர் (விருப்பம்)', address: 'முகவரி (விருப்பம்)', cans: 'கேன்கள்', total: 'மொத்தம்', place: 'ஆர்டர் இடு', sending: 'பதிவாகிறது…', hint: 'எண்ணை எழுதவும் அல்லது தொடர்பைத் தேர்ந்தெடுக்கவும்.', saved: 'வழக்கமான ஆர்டர்', close: 'மூடு' },
  hi: { title: 'नया ऑर्डर', phone: 'ग्राहक खोजें', placeholder: 'नाम या मोबाइल नंबर', contacts: 'संपर्क', recent: 'हाल के ग्राहक', found: 'मौजूदा ग्राहक', new: 'नया ग्राहक', name: 'नाम (वैकल्पिक)', address: 'पता (वैकल्पिक)', cans: 'कैन', total: 'कुल', place: 'ऑर्डर करें', sending: 'भेज रहे हैं…', hint: 'नंबर लिखें या संपर्क चुनें।', saved: 'सामान्य ऑर्डर', close: 'बंद करें' },
};
export default function QuickOrder({ endpoint, lookupEndpoint = endpoint, people, priceCents, onDone, onClose, initialPhone = '', lang = 'en', saveOnly = false }: Props) {
  const t = copy[lang];
  const [phone, setPhone] = useState(initialPhone);
  const [person, setPerson] = useState<Person | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('');
  const [quantity, setQuantity] = useState(2);
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [remote, setRemote] = useState<Person[]>([]);
  const [selected, setSelected] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const digits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const valid = /^[6-9]\d{9}$/.test(digits) && !/[a-z]/i.test(phone);
  const search = phone.trim().toLowerCase();
  const matches = [...remote, ...people].filter((p, i, list) => list.findIndex(x => x.id === p.id) === i && (p.name.toLowerCase().includes(search) || p.phone.includes(search))).slice(0, 8);
  useEffect(() => {
    if (!valid) { setPerson(null); setChecking(false); return; }
    const controller = new AbortController();
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${lookupEndpoint}?phone=${digits}`, { signal: controller.signal, cache: 'no-store' });
        const body = await response.json() as { customer: Person | null };
        if (!response.ok) throw new Error('Could not find customer.');
        setPerson(body.customer);
        if (body.customer && !edited) setQuantity(body.customer.usual_quantity);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not find customer.'); }
      finally { if (!controller.signal.aborted) setChecking(false); }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [digits, valid, lookupEndpoint, edited]);
  useEffect(() => {
    if (search.length < 2 || selected) { setRemote([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try { const response = await fetch(`${lookupEndpoint}?query=${encodeURIComponent(search)}`, { signal: controller.signal, cache: 'no-store' });
        if (response.ok) { const body = await response.json() as { suggestions?: Person[] }; setRemote(body.suggestions ?? []); }
      } catch { /* Local suggestions remain usable offline. */ }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, selected, lookupEndpoint]);
  function choose(p: Person) { setSelected(true); setPhone(p.phone); setPerson(p); setQuantity(p.usual_quantity); setEdited(false); setName(p.name); setAddress(p.address ?? ''); setArea(p.area ?? ''); setError(''); }
  async function chooseContact() {
    const contacts = (navigator as Navigator & { contacts?: { select: (fields: string[], options: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> } }).contacts;
    if (!contacts) return;
    try { const selected = await contacts.select(['name', 'tel'], { multiple: false }); if (selected[0]?.tel?.[0]) { setPhone(selected[0].tel[0]); setName(selected[0].name?.[0] ?? ''); setPerson(null); setSelected(false); } }
    catch (e) { if ((e as Error).name !== 'AbortError') setError('Could not open contacts.'); }
  }
  async function submit() {
    if (!valid || busy || checking) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(saveOnly ? { phone: digits, name, address, area, usualQuantity: quantity, frequencyDays: 7 } : { phone: digits, name, address, area, quantity }) });
      const result = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not place order.');
      await onDone(result, digits);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not place order.'); }
    finally { setBusy(false); }
  }
  return <div className="quick-overlay" onClick={onClose}><section className="quick-sheet" role="dialog" aria-modal="true" aria-label={saveOnly ? t.new : t.title} onClick={e => e.stopPropagation()}><header><h2>{saveOnly ? t.new : t.title}</h2><button onClick={onClose} aria-label={t.close}><X size={22}/></button></header><div className="quick-body">
    <label className="quick-label">{t.phone}<div className="quick-phone"><Search size={20}/><input ref={input} inputMode="search" autoComplete="off" placeholder={t.placeholder} value={phone} onChange={e => { setPhone(e.target.value); setName('');setAddress('');setArea(''); setPerson(null); setSelected(false); setEdited(false); setError(''); }}/></div></label>
    {navigatorHasContacts() && <button className="quick-contact" onClick={chooseContact}><ContactRound size={20}/>{t.contacts}</button>}
    {(!search || (!selected && matches.length > 0)) && <><p className="quick-hint">{t.hint}</p><span className="quick-subtitle">{search ? (lang === 'ta' ? 'பொருந்தும் வாடிக்கையாளர்கள்' : lang === 'hi' ? 'मिलते ग्राहक' : 'Matching customers') : t.recent}</span><div className="quick-recent">{(search ? matches : people.slice(0,5)).map(p => <button key={p.id} onClick={() => choose(p)}><span>{p.name[0]?.toUpperCase()}</span><strong>{p.name}</strong><small>{p.phone}</small></button>)}</div></>}
    {valid && <><div className="quick-person"><span className="quick-person-icon">{person ? <Check size={20}/> : <Plus size={20}/>}</span><span><strong>{checking ? '…' : person?.name ?? (name || t.new)}</strong><small>{person ? `${t.found} · ${t.saved}: ${person.usual_quantity}` : t.new}</small></span></div>{!person && !checking && <div className="quick-optional"><label>{t.name}<input value={name} onChange={e => setName(e.target.value)} autoComplete="name"/></label><label>{lang === 'ta' ? 'பகுதி (விருப்பம்)' : lang === 'hi' ? 'इलाका (वैकल्पिक)' : 'Area (optional)'}<input value={area} onChange={e => setArea(e.target.value)}/></label><label>{t.address}<input value={address} onChange={e => setAddress(e.target.value)} autoComplete="street-address"/></label></div>}</>}
    <div className="quick-qty"><span>{t.cans}</span><div><button disabled={quantity <= 1} onClick={() => { setEdited(true); setQuantity(q => q - 1); }} aria-label="Minus one can"><Minus size={21}/></button><strong>{quantity}</strong><button disabled={quantity >= 50} onClick={() => { setEdited(true); setQuantity(q => q + 1); }} aria-label="Plus one can"><Plus size={21}/></button></div></div>
    {error && <p className="quick-error" role="alert">{error}</p>}
  </div><footer>{!saveOnly && <span>{t.total}<strong>₹{(quantity * priceCents / 100).toLocaleString('en-IN')}</strong></span>}<button disabled={!valid || busy || checking || (saveOnly && !!person)} onClick={submit}>{busy ? t.sending : saveOnly ? (lang === 'ta' ? 'வாடிக்கையாளரைச் சேர்' : lang === 'hi' ? 'ग्राहक जोड़ें' : 'Add customer') : t.place}</button></footer></section></div>;
}
function navigatorHasContacts() { return typeof navigator !== 'undefined' && typeof (navigator as Navigator & { contacts?: { select?: unknown } }).contacts?.select === 'function'; }
