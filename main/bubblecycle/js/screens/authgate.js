// "Confirm it's you", asked at the last step: when someone submits a log, check-in or reward, after they have
// filled everything in. The host form keeps its state the whole time, so a cancelled or failed confirmation
// never loses what was entered; pressing the same button again retries.
import { html, useEffect, useRef, useState } from '../lib.js';
import { Icon, DemoTag } from '../ui.js';
import { getState, markAuthIntroSeen } from '../store.js';
import { confirmAction } from '../services/deviceauth.js';

const BLOCKED = ['insecure', 'unsupported', 'unavailable', 'demo_account'];

const MESSAGES = {
  cancelled: ['Confirmation was cancelled or timed out', 'Nothing was sent.'],
  not_verified: ['Your device didn’t confirm it’s you', 'Try again with your face, fingerprint or passcode.'],
  offline: ['You’re offline', 'Confirmation needs a connection.'],
  busy: ['Too many attempts', 'Wait a moment and try again.'],
  error: ['Something went wrong', 'Nothing was sent.'],
  insecure: ['Device confirmation needs a secure connection', 'Open the app over https (or on localhost) to use it.'],
  unsupported: ['This browser can’t confirm it’s you', 'Try a recent version of Chrome, Safari, Edge or Firefox.'],
  unavailable: ['This device has no screen lock yet', 'Turn on Face ID, a fingerprint or a passcode in your device settings, then check again.'],
  demo_account: ['This demo account has no passkey', 'Create an account with a passkey, or continue with a simulated step for the demo.'],
};

function ConfirmPanel({ stage, onAnswer }) {
  const primary = useRef();
  useEffect(() => { if (stage.name === 'intro' || stage.name === 'blocked') primary.current?.focus(); }, [stage.name]);

  if (stage.name === 'asking') return html`<p class="muted" role="status"><${Icon} name="shield" size=${18} /> Waiting for your device…</p>`;

  if (stage.name === 'failed') {
    const [title, text] = MESSAGES[stage.reason] || MESSAGES.error;
    return html`<p class="note tone-peach" role="alert"><${Icon} name="alert" size=${18} /> <span><strong>${title}.</strong> ${text} Your entries are still here. Press the button to try again.</span></p>`;
  }

  if (stage.name === 'blocked') {
    const [title, text] = MESSAGES[stage.reason];
    return html`<div class="card-inset stack-sm" role="alert">
      <p><${Icon} name="alert" size=${18} /> <strong>${title}.</strong> ${text}</p>
      <div class="row gap wrap">
        <button type="button" class="btn btn-primary btn-sm" ref=${primary} onClick=${() => onAnswer('retry')}><${Icon} name="refresh" size=${18} /> Check again</button>
        ${stage.canSimulate && html`<button type="button" class="btn btn-ghost btn-sm" onClick=${() => onAnswer('simulate')}>Continue with a simulated step</button>`}
      </div>
      ${stage.canSimulate && html`<p class="small"><${DemoTag}>Prototype only<//> The simulated step checks nothing about who you are. It exists so the demo can run on devices that can’t do the real one.</p>`}
    </div>`;
  }

  // intro: explained once, before the first prompt
  return html`<div class="card-inset stack-sm" role="group" aria-label="About confirming it’s you">
    <h3 style="margin:0"><${Icon} name="shield" size=${20} /> Confirm it’s you</h3>
    <p>Before points are added or spent, your device asks you to unlock it with your face, fingerprint or passcode, whichever you’ve set up. RECYCL IT! only learns whether it worked. It never sees or stores your face or fingerprint.</p>
    <p class="small muted">This helps stop someone else using your unlocked device or account. It doesn’t prove you recycled, that you’re at a station, or that you have only one account.</p>
    <div class="row gap">
      <button type="button" class="btn btn-primary btn-sm" ref=${primary} onClick=${() => onAnswer(true)}>Continue</button>
      <button type="button" class="btn btn-ghost btn-sm" onClick=${() => onAnswer(false)}>Not now</button>
    </div>
  </div>`;
}

// const confirm = useConfirm();   ...   const c = await confirm.run({ purpose: 'activity', keys: [key] });
// Render `confirm.panel` next to the submit button. `confirm.failed` is true after a failed attempt (label the button "Try again").
export function useConfirm() {
  const [stage, setStage] = useState(null);
  const waiter = useRef(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; waiter.current?.(null); }; }, []);

  const ask = (next) => new Promise((resolve) => { waiter.current = resolve; setStage(next); });
  const answer = (v) => { const w = waiter.current; waiter.current = null; w?.(v); };

  async function run(opts) {
    if (!getState().authIntroSeen) {
      const go = await ask({ name: 'intro' });
      if (!go) { if (alive.current) setStage(null); return { ok: false, reason: 'declined' }; }
      markAuthIntroSeen();
    }
    for (;;) {
      if (alive.current) setStage({ name: 'asking' });
      const res = await confirmAction(opts);
      if (!alive.current) return { ok: false, reason: 'closed' };
      if (res.ok) { setStage(null); return res; }
      if (BLOCKED.includes(res.reason)) {
        const choice = await ask({ name: 'blocked', reason: res.reason, canSimulate: !!res.simulate });
        if (choice === 'retry') continue;
        if (choice === 'simulate' && res.simulate) {
          const sim = await res.simulate().catch(() => ({ ok: false, reason: 'error' }));
          if (alive.current) setStage(sim.ok ? null : { name: 'failed', reason: sim.reason });
          return sim;
        }
        if (alive.current) setStage(null);
        return { ok: false, reason: res.reason };
      }
      setStage({ name: 'failed', reason: res.reason });
      return res;
    }
  }

  return {
    run,
    panel: stage ? html`<${ConfirmPanel} stage=${stage} onAnswer=${answer} />` : null,
    failed: stage?.name === 'failed',
    busy: stage?.name === 'asking',
    waiting: stage?.name === 'intro' || stage?.name === 'blocked',
  };
}

// Shown after a successful submission when the confirmation was the simulated demo step.
export function SimulatedNote({ method }) {
  return method === 'simulated' ? html`<p class="small"><${DemoTag}>Simulated<//> The confirmation step was simulated, not a real device check.</p>` : null;
}
