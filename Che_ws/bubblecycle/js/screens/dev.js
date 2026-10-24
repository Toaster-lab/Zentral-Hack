// Developer tools. Not linked from the normal screens: open it at #/dev. Everything here affects the on-device
// demo only; with the server (live mode) there is nothing to switch on.
import { html, useState } from '../lib.js';
import { Header, Toggle, toast } from '../ui.js';
import { devFlags, resetSocialDemo } from '../services/index.js';
import { clockOffset, setClockOffset } from '../logic/clock.js';
import { navigate } from '../router.js';
import { env } from '../env.js';

export default function Dev() {
  const [simErrors, setSimErrors] = useState(devFlags.simulateErrors);
  if (env.mode === 'live') {
    return html`<div class="screen"><${Header} back title="Developer" /><p class="muted">Developer tools aren’t available on a live server.</p></div>`;
  }
  return html`<div class="screen">
    <${Header} back title="Developer" subtitle="Demo tools. Not part of the app for everyday use." />
    <section class="card stack">
      <${Toggle} checked=${simErrors} onChange=${(v) => { devFlags.simulateErrors = v; setSimErrors(v); }}
        label="Simulate network errors" description="Demo services fail, so you can see the error states. Resets on reload." />
      <div class="stack-sm">
        <strong>Demo clock</strong>
        <p class="muted small">Jump ahead to see challenges finish and streaks end. ${clockOffset() ? `Currently ${Math.round(clockOffset() / 86400000)} days ahead.` : 'Currently real time.'} This changes this device’s clock only; a server never follows it.</p>
        <div class="row gap"><button class="btn btn-ghost btn-sm" onClick=${() => { setClockOffset(clockOffset() + 7 * 86400000); location.reload(); }}>+1 week</button><button class="btn btn-ghost btn-sm" onClick=${() => { setClockOffset(0); location.reload(); }}>Reset clock</button></div>
        <button class="btn btn-ghost btn-sm" onClick=${async () => { await resetSocialDemo(); toast('Simulated friends and challenges reset'); }}>Reset simulated friends & challenges</button>
      </div>
      <div class="stack-sm">
        <strong>Demo map review</strong>
        <p class="muted small">Approve or reject map places added on this device. It has no effect on recycling activity or points.</p>
        <button class="btn btn-ghost btn-sm" onClick=${() => navigate('admin')}>Open demo map review</button>
      </div>
    </section>
  </div>`;
}
