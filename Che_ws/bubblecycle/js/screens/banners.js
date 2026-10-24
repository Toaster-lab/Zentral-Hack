// App-wide notices: being offline, things waiting to be sent, and a new version being ready.
import { html, useEffect, useState } from '../lib.js';
import { Icon, openSheetCount } from '../ui.js';
import { useStore } from '../store.js';
import { navigate } from '../router.js';
import { env } from '../env.js';

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true); const down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

export function OfflineStrip() {
  const online = useOnline();
  if (online) return null;
  return html`<p class="note tone-lavender offline-strip" role="status"><${Icon} name="info" size=${18} /> <span>You’re offline. Map tiles aren’t available, and ${env.api ? 'anything you log is saved on this device and not counted until it’s sent.' : 'what you log is saved on this device.'}</span></p>`;
}

export function OutboxBanner({ route }) {
  const s = useStore();
  const waiting = s.outbox.filter((o) => o.status === 'queued').length;
  if (!env.api || !waiting || route === 'activity') return null;
  return html`<p class="note tone-lavender" role="status"><${Icon} name="clock" size=${18} /> <span>${waiting} saved on this device, not sent yet. <button class="link-btn" onClick=${() => navigate('activity')}>Review and send</button></span></p>`;
}

// A new version downloads in the background but never swaps in under someone's hands: it waits for them to
// choose, and asks them to finish what's open first, so nothing typed is lost.
export function UpdateBanner({ route }) {
  const [reg, setReg] = useState(window.__swWaiting || null);
  const [, tick] = useState(0);
  useEffect(() => {
    const on = () => setReg(window.__swWaiting || null);
    window.addEventListener('bc-update', on);
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => { window.removeEventListener('bc-update', on); clearInterval(t); };
  }, []);
  if (!reg) return null;
  const busy = openSheetCount() > 0 || route === 'add';
  return html`<p class="note update-banner" role="status"><${Icon} name="refresh" size=${18} /> <span>A new version of RECYCL IT! is ready. ${busy ? 'Finish what you’re doing, then update.' : 'Updating reloads the app.'}
    <button class="btn btn-primary btn-sm" disabled=${busy} onClick=${() => reg.postMessage({ type: 'SKIP_WAITING' })}>Update now</button></span></p>`;
}
