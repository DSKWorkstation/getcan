'use client';

// The desk keeps working with a weak signal: the last loaded desk is saved on
// this device, and deliveries or empty-can pickups made offline wait in an
// outbox. Only requests that are safe to send twice are queued: a delivery is
// guarded by its status on the server, and a pickup carries a receipt ID.
const SNAPSHOT = 'getcan-desk', OUTBOX = 'getcan-outbox';
type Queued = { path: string; method: string; body: unknown };

function read<T>(key: string): T | null {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : null; } catch { return null; }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

export function saveSnapshot(data: unknown): void { write(SNAPSHOT, { savedAt: new Date().toISOString(), data }); }
export function readSnapshot<T>(): { savedAt: string; data: T } | null { return read(SNAPSHOT); }
export function outboxSize(): number { return read<Queued[]>(OUTBOX)?.length ?? 0; }
export function queueRequest(path: string, method: string, body: unknown): void { write(OUTBOX, [...(read<Queued[]>(OUTBOX) ?? []), { path, method, body }]); }

/** Remove this device's saved desk and outbox, e.g. on sign out. */
export function clearOffline(): void {
  try { localStorage.removeItem(SNAPSHOT); localStorage.removeItem(OUTBOX); } catch { /* ignore */ }
}

/**
 * Send queued changes in order. A network failure stops and keeps the rest; a
 * request the server rejects (for example an order someone else already
 * completed) is dropped and its message returned so the desk can show it.
 */
export async function flushOutbox(): Promise<string[]> {
  const queue = read<Queued[]>(OUTBOX) ?? [];
  const problems: string[] = [];
  while (queue.length) {
    const item = queue[0];
    let response: Response;
    try {
      response = await fetch(`/api/commercial/${item.path}`, { method: item.method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.body) });
    } catch { break; }
    if (response.status === 401) break;
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      problems.push(`A change saved offline was not applied: ${result.error ?? 'please check it again.'}`);
    }
    queue.shift();
    write(OUTBOX, queue);
  }
  return problems;
}

/** Orders marked delivered offline, so the saved desk can show them as done. */
export function queuedDeliveries(): number[] {
  return (read<Queued[]>(OUTBOX) ?? []).filter(item => item.path === 'orders').map(item => Number((item.body as { id?: number }).id));
}

export const isNetworkError = (error: unknown): boolean => error instanceof TypeError;
