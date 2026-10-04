// Prints a VAPID key pair for Web Push alerts. Save both values as Worker secrets:
//   npx wrangler secret put VAPID_PUBLIC_KEY
//   npx wrangler secret put VAPID_PRIVATE_KEY
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
const base64url = bytes => Buffer.from(bytes).toString('base64url');
console.log(`VAPID_PUBLIC_KEY=${base64url(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);
