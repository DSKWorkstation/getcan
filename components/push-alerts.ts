'use client';

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const keyBytes = (key: string) => Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((key.length + 3) % 4)), c => c.charCodeAt(0));

/** Ask permission and register this device for alerts. A customer passes their link token. */
export async function enablePush(publicKey: string, token?: string): Promise<void> {
  if (!pushSupported()) throw new Error('This browser cannot show alerts. Add GetCan to your home screen and try again.');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Alerts are blocked. Allow notifications for this site in your browser settings.');
  const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(() => navigator.serviceWorker.ready);
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const response = await fetch('/api/commercial/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint, token }) });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'Could not turn on alerts.');
}

/** True when this device already receives alerts. */
export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.getRegistration();
  return !!(await registration?.pushManager.getSubscription());
}

/** A short two-tone chime, so a new request is noticed with the app open. */
export function chime(): void {
  try {
    const audio = new AudioContext();
    [880, 1320].forEach((frequency, i) => {
      const tone = audio.createOscillator(), gain = audio.createGain();
      tone.frequency.value = frequency; tone.connect(gain); gain.connect(audio.destination);
      const at = audio.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      tone.start(at); tone.stop(at + 0.17);
    });
    navigator.vibrate?.([120, 60, 120]);
  } catch { /* Sound is a courtesy; ignore unsupported browsers. */ }
}
