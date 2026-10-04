'use client';
import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import qrcode from 'qrcode-generator';

// Google Pay and some banks refuse UPI links that open a payment to a personal
// UPI ID ("exceeded the bank limit"), so the link is backed by a QR code and the
// UPI ID itself: scanning or typing the ID inside the UPI app is not blocked.
export default function UpiPay({ upiId, payee, amountCents, t }: { upiId: string; payee: string; amountCents: number; t: (english: string) => string }) {
  const [copied, setCopied] = useState(false);
  const amount = (amountCents / 100).toFixed(2);
  const link = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}&am=${amount}&cu=INR&tn=${encodeURIComponent('GetCan water')}`;
  const qr = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(link);
    code.make();
    return code.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [link]);
  const rupees = `₹${(amountCents / 100).toLocaleString('en-IN')}`;

  async function copy() {
    try { await navigator.clipboard.writeText(upiId); }
    catch {
      const field = document.createElement('textarea');
      field.value = upiId; document.body.appendChild(field); field.select();
      try { document.execCommand('copy'); } finally { field.remove(); }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return <div className="gc-upi-pay">
    <a className="gc-primary" href={link}>{t('Pay by UPI')} · {rupees}</a>
    <p className="gc-upi-help">{t('If your UPI app shows a bank limit error, scan this QR code or pay to the UPI ID below from inside your app.')}</p>
    <div className="gc-upi-ways">
      <figure className="gc-upi-qr"><span role="img" aria-label={`${t('UPI QR code')} ${rupees}`} dangerouslySetInnerHTML={{ __html: qr }}/>
        <figcaption>{t('Scan with any UPI app. On this phone, take a screenshot and use Scan from gallery.')}</figcaption></figure>
      <div className="gc-upi-id"><small>{t('UPI ID')}</small><strong>{upiId}</strong><small>{payee} · {rupees}</small>
        <button type="button" className="gc-quiet" onClick={() => void copy()}>{copied ? <Check size={16}/> : <Copy size={16}/>}{t(copied ? 'Copied' : 'Copy UPI ID')}</button></div>
    </div>
  </div>;
}
