// Global "Log recycling" sheet. Open it from anywhere with openLogSheet({ entries, stationId, source }).
import { html, useEffect, useState } from '../lib.js';
import { Sheet, Icon, MaterialChip, toast } from '../ui.js';
import { COUNTABLE, MATERIALS } from '../logic/rules.js';
import { logRecycling, getState } from '../store.js';
import { verifyReceipt, isDemo } from '../services/index.js';
import { DEMO_RECEIPT_CODES } from '../data/misc.js';
import { config } from '../config.js';
import { navigate } from '../router.js';

let opener = null;
export function openLogSheet(opts = {}) { opener?.(opts); }

const RECEIPT_RE = /^BC-\d{4}-[A-Z]{2}$/;

export function LogSheetHost() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [ctx, setCtx] = useState({});
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    opener = (opts) => {
      setEntries(opts.entries?.length ? opts.entries.map((e) => ({ ...e })) : [{ material: null, count: 1 }]);
      setCtx({ stationId: opts.stationId || null, stationName: opts.stationName || null, source: opts.source || 'manual' });
      setCode(''); setError(''); setDone(null); setBusy(false); setOpen(true);
    };
    return () => { opener = null; };
  }, []);

  const close = () => setOpen(false);
  const update = (i, patch) => setEntries((es) => es.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const used = entries.map((e) => e.material);

  async function submit(e) {
    e.preventDefault();
    setError('');
    const receipt = code.trim().toUpperCase();
    let verified = false;
    setBusy(true);
    try {
      if (receipt) {
        if (!RECEIPT_RE.test(receipt)) throw new Error('Receipt codes look like BC-1234-ZH.');
        if (getState().usedReceiptCodes.includes(receipt)) throw new Error('That receipt code has already been used.');
        const res = await verifyReceipt(receipt);
        if (!res.valid) throw new Error('We couldn’t verify that receipt code. You can still log without it (self-reported).');
        verified = true;
      }
      const res = logRecycling(entries.map((x) => ({ material: x.material, count: Number(x.count) })), {
        verified, receiptCode: receipt || null, stationId: ctx.stationId, source: ctx.source,
      });
      if (!res.ok) throw new Error(res.error);
      setDone(res);
      toast(`+${res.points} points · ${res.accepted} item${res.accepted > 1 ? 's' : ''} logged`);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  if (done) {
    return html`<${Sheet} open=${open} onClose=${close} title="Logged">
      <div class="success-pop">
        <p class="big"><strong>+${done.points} points</strong></p>
        <p>${done.accepted} recyclable item${done.accepted > 1 ? 's' : ''} counted · <span class=${`tag ${done.verification === 'verified' ? 'tag-verified' : 'tag-self'}`}>${done.verification === 'verified' ? 'Verified' : 'Self-reported'}</span></p>
        ${done.capped && html`<p class="note tone-peach">Part of this log went over the daily cap of ${config.limits.maxItemsPerDay} items, so only ${done.accepted} items were counted.</p>`}
        <div class="row gap">
          <button class="btn btn-ghost" onClick=${() => { close(); navigate('leaderboard'); }}><${Icon} name="trophy" /> Leaderboard</button>
          <button class="btn btn-primary" onClick=${() => { close(); navigate('rewards'); }}><${Icon} name="gift" /> Rewards</button>
        </div>
      </div>
    <//>`;
  }

  return html`<${Sheet} open=${open} onClose=${close} title="Log recycling">
    <form onSubmit=${submit} class="stack" novalidate>
      ${ctx.stationName && html`<p class="muted small"><${Icon} name="pin" size=${16} /> At ${ctx.stationName}</p>`}
      ${entries.map((entry, i) => html`
        <fieldset class="log-entry card-inset" key=${i}>
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
      ${entries.length < 4 && html`<button type="button" class="btn btn-ghost btn-sm" onClick=${() => setEntries((es) => [...es, { material: null, count: 1 }])}><${Icon} name="plus" size=${18} /> Add another material</button>`}

      <label class="field">
        <span class="strong">Station receipt code <span class="muted">(optional)</span></span>
        <input type="text" placeholder="e.g. BC-1001-ZH" value=${code} autocapitalize="characters" autocomplete="off"
          onInput=${(e) => setCode(e.target.value)} />
        <span class="muted small">A code from a station receipt marks this log as <strong>verified</strong> (+${config.points.verifiedBonusPerItem} bonus points per item). Without one it counts as <strong>self-reported</strong>.
          ${isDemo('receipts') && html` Demo codes: ${DEMO_RECEIPT_CODES.slice(0, 3).join(', ')} (each works once).`}</span>
      </label>

      ${error && html`<p class="note tone-peach" role="alert"><${Icon} name="alert" size=${18} /> ${error}</p>`}

      <button class="btn btn-primary btn-block" type="submit" disabled=${busy}>${busy ? 'Checking…' : 'Log it & earn points'}</button>
      <p class="muted small center">Fair-play limits: max ${config.limits.maxItemsPerLog} per material per log, ${config.limits.maxItemsPerDay} items and ${config.limits.maxLogsPerDay} logs per day. Repeats within ${config.limits.duplicateWindowMin} minutes are flagged as duplicates.</p>
    </form>
  <//>`;
}
