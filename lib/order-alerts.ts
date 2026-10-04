import { database } from '@/lib/commercial';
import { notify, pushPublicKey } from '@/lib/push';

/** Tell a customer's subscribed devices that their order moved on. */
export async function customerUpdate(owner: number, customerId: number, stage: 'dispatched' | 'delivered', quantity: number): Promise<void> {
  if (!pushPublicKey()) return;
  const distributor = await database().prepare('SELECT name FROM app_distributors WHERE id=?').bind(owner).first<{ name: string }>();
  const cans = `${quantity} ${quantity === 1 ? 'can' : 'cans'}`;
  // The click opens the customer's saved order page; the service worker knows it.
  await notify({ distributorId: owner, kind: 'customer', customerId }, stage === 'dispatched'
    ? { title: 'Water on the way', body: `${cans} from ${distributor?.name ?? 'your supplier'} will reach you soon.`, url: 'customer' }
    : { title: 'Water delivered', body: `${cans} delivered by ${distributor?.name ?? 'your supplier'}.`, url: 'customer' });
}
