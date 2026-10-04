import { env } from 'cloudflare:workers';
import { database, randomToken, sha256 } from '@/lib/commercial';

// Customer request links are bearer tokens. The database keeps only their
// SHA-256 digest for lookups plus an AES-GCM sealed copy so the distributor can
// share the same link again. Without LINK_SECRET the sealed copy cannot be
// opened, so a database read alone never exposes a live link.
type LinkRow = { token: string; token_cipher: string | null };

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));

async function linkKey(): Promise<CryptoKey | null> {
  if (!env.LINK_SECRET) return null;
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.LINK_SECRET));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealToken(token: string): Promise<{ token: string; cipher: string | null }> {
  const key = await linkKey();
  if (!key) return { token, cipher: null };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
  return { token: '', cipher: `${toBase64(iv)}.${toBase64(sealed)}` };
}

export async function openToken(row: LinkRow): Promise<string | null> {
  if (!row.token_cipher) return row.token || null;
  const key = await linkKey();
  if (!key) return null;
  const [iv, sealed] = row.token_cipher.split('.');
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(sealed));
    return new TextDecoder().decode(plain);
  } catch { return null; }
}

const linkUrl = (origin: string, token: string) => `${origin}/c/${token}`;

/** Store a newly issued link for a customer unless one already exists. */
export async function saveLink(owner: number, customerId: number, token: string): Promise<void> {
  const sealed = await sealToken(token);
  await database().prepare('INSERT OR IGNORE INTO app_customer_links (customer_id,distributor_id,token,token_cipher,token_hash) VALUES (?,?,?,?,?)')
    .bind(customerId, owner, sealed.token, sealed.cipher, await sha256(token)).run();
}

/** The customer's current link, creating one when none exists yet. */
export async function customerLink(owner: number, customerId: number, origin: string): Promise<string> {
  const db = database();
  let row = await db.prepare('SELECT token,token_cipher FROM app_customer_links WHERE customer_id=? AND distributor_id=?').bind(customerId, owner).first<LinkRow>();
  if (!row) {
    await saveLink(owner, customerId, randomToken());
    row = await db.prepare('SELECT token,token_cipher FROM app_customer_links WHERE customer_id=? AND distributor_id=?').bind(customerId, owner).first<LinkRow>();
  }
  const token = row ? await openToken(row) : null;
  // A link sealed under a different secret cannot be recovered; issue a new one.
  if (!token) return resetCustomerLink(owner, customerId, origin);
  if (row && !row.token_cipher) await sealLegacyLink(owner, customerId, token);
  return linkUrl(origin, token);
}

/** Replace a customer's link. Every earlier link for this customer stops working. */
export async function resetCustomerLink(owner: number, customerId: number, origin: string): Promise<string> {
  const db = database();
  const token = randomToken();
  const sealed = await sealToken(token);
  const hash = await sha256(token);
  await db.batch([
    db.prepare('UPDATE app_customers SET request_token_hash=?,updated_at=? WHERE id=? AND distributor_id=?').bind(await sha256(randomToken()), new Date().toISOString(), customerId, owner),
    db.prepare(`INSERT INTO app_customer_links (customer_id,distributor_id,token,token_cipher,token_hash) VALUES (?,?,?,?,?)
      ON CONFLICT(customer_id) DO UPDATE SET token=excluded.token,token_cipher=excluded.token_cipher,token_hash=excluded.token_hash`).bind(customerId, owner, sealed.token, sealed.cipher, hash),
    db.prepare("DELETE FROM app_push_subscriptions WHERE kind='customer' AND customer_id=? AND distributor_id=?").bind(customerId, owner),
  ]);
  return linkUrl(origin, token);
}

async function sealLegacyLink(owner: number, customerId: number, token: string): Promise<void> {
  const sealed = await sealToken(token);
  if (!sealed.cipher) return;
  await database().prepare("UPDATE app_customer_links SET token='',token_cipher=? WHERE customer_id=? AND distributor_id=? AND token=?")
    .bind(sealed.cipher, customerId, owner, token).run();
}

/** Seal any links this distributor stored before LINK_SECRET was configured. */
export async function sealLegacyLinks(owner: number): Promise<void> {
  if (!env.LINK_SECRET) return;
  const rows = await database().prepare("SELECT customer_id,token FROM app_customer_links WHERE distributor_id=? AND token<>'' LIMIT 200")
    .bind(owner).all<{ customer_id: number; token: string }>();
  for (const row of rows.results) await sealLegacyLink(owner, row.customer_id, row.token);
}
