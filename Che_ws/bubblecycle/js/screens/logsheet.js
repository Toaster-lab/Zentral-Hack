// Global "Log recycling" sheet. Open it from anywhere with openLogSheet({ entries, stationId, source }).
// Fill in the form first; "Confirm it's you" happens last, when the person presses the submit button.
import { html, useEffect, useRef, useState } from '../lib.js';
import { Sheet, Icon, MaterialChip, DemoTag, StateCard, toast } from '../ui.js';
import { COUNTABLE, MATERIALS } from '../logic/rules.js';
import { evaluateLog } from '../logic/activity.js';
import { logRecycling, getState } from '../store.js';
import { verifyReceipt, isDemo } from '../services/index.js';
import { DEMO_RECEIPT_CODES } from '../data/misc.js';
import { config } from '../config.js';
import { env } from '../env.js';
import { navigate } from '../router.js';
import { useConfirm, SimulatedNote } from './authgate.js';
import { requireSignIn } from './account.js';
import { getAccount } from '../services/account.js';
import { sendActivity, saveForLater, newKey, isOffline } from '../services/activity.js';
import { NetworkError } from '../services/api.js';

let opener = null;
export function openLogSheet(opts = {}) { opener?.(opts); }

const RECEIPT_RE = /^BC-\d{4}-[A-Z]{2}$/;
// Demo codes are case-insensitive. A signed receipt from a real issuer is case-sensitive, so it's sent exactly as typed.
const cleanReceipt = (raw) => (raw.trim().startsWith('BCR.') ? raw.trim() : raw.trim().toUpperCase());

export function LogSheetHost() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [ctx, setCtx] = useState({});
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const inflight = useRef(false);   // a second tap while the first is still running does nothing
  const draft = useRef({ hash: '', key: '' }); // the same draft keeps the same submission key, so a retry can't count twice
  const confirm = useConfirm();

  useEffect(() => {
    opener = (opts) => {
      setEntries(opts.entries?.length ? opts.entries.map((e) => ({ ...e })) : [{ material: null, count: 1 }]);
      setCtx({ stationId: opts.stationId || null, stationName: opts.stationName || null, source: opts.source || 'manual' });
      setCode(''); setError(''); setDone(null); setBusy(false); inflight.current = false; draft.current = { hash: '', key: '' }; setOpen(true);
    };
    return () => { opener = null; };
  }, []);

  const close = () => setOpen(false);
  const update = (i, patch) => setEntries((es) => es.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const used = entries.map((e) => e.material);
  const serverReceipts = getAccount().server?.receipts;
  const receiptsAvailable = !env.api || serverReceipts?.demoCodes || serverReceipts?.trustedSource;

  function keyFor(clean, receipt) {
    const hash = JSON.stringify([clean, receipt, ctx.stationId]);
    if (draft.current.hash !== hash) draft.current = { hash, key: newKey() };
    return draft.current.key;
  }

  async function submit(e) {
    e.preventDefault();
    if (inflight.current || done) return;
    inflight.current = true; setBusy(true); setError('');
    try {
      const clean = entries.map((x) => ({ material: x.material, count: Number(x.count) }));
      const receipt = cleanReceipt(code);

      // 1. Quick checks on this device, so mistakes are caught before anyone is asked to unlock anything.
      //    With the server these are only a courtesy: the server checks again and decides.
      const pre = evaluateLog(getState().activities, clean);
      if (!pre.ok) throw new Error(pre.error);
      let verified = false;
      if (!env.api && receipt) {
        if (!RECEIPT_RE.test(receipt)) throw new Error('Receipt codes look like BC-1234-ZH.');
        if (getState().usedReceiptCodes.includes(receipt)) throw new Error('That receipt code has already been used.');
        const res = await verifyReceipt(receipt);
        if (!res.valid) throw new Error('We couldn’t verify that receipt code. You can still log without it (self-reported).');
        verified = true;
      }

      const key = keyFor(clean, receipt);
      const payload = { entries: clean, stationId: ctx.stationId || undefined, source: ctx.source, receiptCode: receipt || undefined };

      if (env.api) {
        if (!(await requireSignIn())) return;
        if (isOffline()) { // can't be confirmed or accepted now: keep it, clearly marked as not counted
          saveForLater({ key, kind: 'log', label: pre.entries.map((x) => `${x.count} × ${MATERIALS[x.material].label.toLowerCase()}`).join(', '), payload });
          setDone({ queued: true });
          return;
        }
      }

      // 2. Confirm it's you (last step before anything is sent or counted).
      const c = await confirm.run({ purpose: 'activity', keys: [key] });
      if (!c.ok) return;

      // 3. Submit.
      let result;
      if (env.api) {
        const out = await sendActivity({ key, kind: 'log', ...payload, confirmationId: c.confirmationId });
        result = { points: out.points, accepted: out.accepted, verification: out.verification, capped: out.capped };
      } else {
        const res = logRecycling(clean, { verified, receiptCode: receipt || null, stationId: ctx.stationId, source: ctx.source });
        if (!res.ok) throw new Error(res.error);
        result = res;
      }
      setDone({ ...result, method: c.method });
      toast(`+${result.points} points · ${result.accepted} item${result.accepted > 1 ? 's' : ''} logged`);
    } catch (err) {
      if (env.api && err instanceof NetworkError) {
        const clean = entries.map((x) => ({ material: x.material, count: Number(x.count) }));
        saveForLater({ key: keyFor(clean, cleanReceipt(code)), kind: 'log', label: clean.map((x) => `${x.count} × ${MATERIALS[x.material].label.toLowerCase()}`).join(', '), payload: { entries: clean, stationId: ctx.stationId || undefined, source: ctx.source, receiptCode: cleanReceipt(code) || undefined } });
        setDone({ queued: true });
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  if (!open) return null;
  const dismissable = !busy || confirm.waiting;

  if (done?.queued) {
    return html`<${Sheet} open=${open} onClose=${close} title="Saved on this device">
      <${StateCard} icon="clock" tone="lavender" title="Not counted yet">
        You’re offline, so this is saved here and has not been sent. When you’re back online you’ll be asked to confirm it’s you, and the server will check it before any points are added. It may still be refused.
      <//>
      <button class="btn btn-primary" onClick=${() => { close(); navigate('activity'); }}>See what’s waiting</button>
    <//>`;
  }

  if (done) {
    return html`<${Sheet} open=${open} onClose=${close} title="Logged">
      <div class="success-pop">
        <p class="big"><strong>+${done.points} points</strong></p>
        <p>${done.accepted} recyclable item${done.accepted > 1 ? 's' : ''} counted · <span class=${`tag ${done.verification === 'verified' ? 'tag-verified' : 'tag-self'}`}>${done.verification === 'verified' ? 'Verified' : 'Self-reported'}</span></p>
        ${done.capped && html`<p class="note tone-peach">Part of this log went over the daily cap of ${config.limits.maxItemsPerDay} items, so only ${done.accepted} items were counted.</p>`}
        <${SimulatedNote} method=${done.method} />
        <div class="row gap">
          <button class="btn btn-ghost" onClick=${() => { close(); navigate('leaderboard'); }}><${Icon} name="trophy" /> Leaderboard</button>
          <button class="btn btn-primary" onClick=${() => { close(); navigate('rewards'); }}><${Icon} name="gift" /> Rewards</button>
        </div>
      </div>
    <//>`;
  }

  return html`<${Sheet} open=${open} onClose=${close} dismissable=${dismissable} title="Log recycling">
    <form onSubmit=${submit} class="stack" novalidate aria-busy=${busy ? 'true' : 'false'}>
      ${ctx.stationName && html`<p class="muted small"><${Icon} name="pin" size=${16} /> At ${ctx.stationName}</p>`}
      ${entries.map((entry, i) => html`
        <fieldset class="log-entry card-inset" key=${i} disabled=${busy}>
          <legend class="small strong">What did you recycle?</legend>
          <div class="chip-wrap">
            ${COUNTABLE.map((m) => html`<${MaterialChip} small material=${m} selected=${entry.material === m}
              onClick=${() => (used.includes(m) && entry.material !== m ? setError(`${MATERIALS[m].label} is already in this log.`) : update(i, { material: m }))} />`)}
          </div>
          <div class="row between center">
            <span class="strong">How many items?</span>
            <div class="stepper">
              <button type="button" class="icon-btn" aria-label="One less" onClick=${() => update(i, { count: Math.max(1, Number(entry.count) - 1) })}><${Icon} name="minus" /></button>
              <input type="number" inputmode="numeric" min="1" max=${config.limits.maxItemsPerLog} aria-label="Number of items"
                value=${entry.count} onInput=${(e) => update(i, { count: e.target.value === '' ? '' : Math.floor(Number(e.target.value)) })} />
              <button type="button" class="icon-btn" aria-label="One more" onClick=${() => update(i, { count: Number(entry.count) + 1 })}><${Icon} name="plus" /></button>
            </div>
          </div>
          ${entries.length > 1 && html`<button type="button" class="link-btn small" onClick=${() => setEntries((es) => es.filter((_, j) => j !== i))}>Remove</button>`}
        </fieldset>`)}
      ${entries.length < 4 && html`<button type="button" class="btn btn-ghost btn-sm" disabled=${busy} onClick=${() => setEntries((es) => [...es, { material: null, count: 1 }])}><${Icon} name="plus" size=${18} /> Add another material</button>`}

      ${receiptsAvailable && html`<label class="field">
        <span class="strong">Station receipt code <span class="muted">(optional)</span></span>
        <input type="text" placeholder=${env.api && !serverReceipts?.demoCodes ? 'From a station receipt' : 'e.g. BC-1001-ZH'} value=${code} autocapitalize=${env.api && !serverReceipts?.demoCodes ? 'off' : 'characters'} autocorrect="off" spellcheck="false" autocomplete="off" disabled=${busy}
          onInput=${(e) => setCode(e.target.value)} />
        <span class="muted small">A code from a station receipt marks this log as <strong>verified</strong> (+${config.points.verifiedBonusPerItem} bonus points per item). Without one it counts as <strong>self-reported</strong>.
          ${isDemo('receipts') && (!env.api || serverReceipts?.demoCodes) && html` Demo codes: ${DEMO_RECEIPT_CODES.slice(0, 3).join(', ')} (each works once).`}</span>
      </label>`}

      ${error && html`<p class="note tone-peach" role="alert"><${Icon} name="alert" size=${18} /> ${error}</p>`}
      ${confirm.panel}

      ${!confirm.waiting && html`<button class="btn btn-primary btn-block" type="submit" disabled=${busy}>${busy ? (confirm.busy ? 'Waiting for your device…' : 'Checking…') : confirm.failed ? 'Try again' : 'Confirm and log it'}</button>`}
      <p class="muted small center">You’ll be asked to unlock your device to confirm it’s you. Limits: ${config.limits.maxItemsPerLog} per material per log, ${config.limits.maxItemsPerDay} items a day.</p>
      ${env.api && env.mode === 'demo' && html`<p class="center"><${DemoTag}>Demo server<//></p>`}
    </form>
  <//>`;
}
