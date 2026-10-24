import { html, useRef, useState } from '../lib.js';
import { Header, Icon, Sheet, DemoTag, toast } from '../ui.js';
import { useStore, getBalance, redeem } from '../store.js';
import { REWARDS } from '../data/misc.js';
import { navigate } from '../router.js';
import { relTime } from '../utils.js';
import { openLogSheet } from './logsheet.js';
import { useConfirm, SimulatedNote } from './authgate.js';
import { requireSignIn } from './account.js';
import { useAccount } from '../services/account.js';
import { redeemOnServer, newKey, isOffline } from '../services/activity.js';
import { env } from '../env.js';

const KIND = { badge: 'Badge', discount: 'Discount', voucher: 'Voucher' };

export default function Rewards() {
  const s = useStore();
  const points = getBalance();
  const [confirm, setConfirm] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);   // a second tap while the first is still running does nothing
  const draft = useRef({ id: '', key: '' }); // the same reward keeps the same key until it's done, so a retry can't charge twice
  const auth = useConfirm();
  const owned = (id) => s.redemptions.some((r) => r.rewardId === id);
  const verifiedItems = s.activities.filter((a) => a.verification === 'verified').reduce((n, a) => n + a.accepted, 0);

  async function doRedeem() {
    if (inflight.current) return;
    inflight.current = true; setBusy(true); setError('');
    try {
      if (env.api) {
        if (!(await requireSignIn())) return;
        if (isOffline()) { setError('You’re offline. Rewards can only be redeemed online.'); return; }
      }
      if (draft.current.id !== confirm.id) draft.current = { id: confirm.id, key: newKey() };
      const key = draft.current.key;
      // Confirm it's you: asked last, with the chosen reward still selected if anything goes wrong.
      const c = await auth.run({ purpose: 'redeem', keys: [key] });
      if (!c.ok) return;
      let res;
      if (env.api) {
        const out = await redeemOnServer({ key, rewardId: confirm.id, confirmationId: c.confirmationId });
        res = { ok: true, reward: confirm, redemption: { id: out.id, ts: out.ts, code: out.code } };
      } else {
        res = redeem(confirm.id);
        if (!res.ok) { setError(res.error); return; }
      }
      draft.current = { id: '', key: '' };
      setConfirm(null); setDone({ ...res, method: c.method }); setError('');
      toast(`Redeemed: ${res.reward.name}`);
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      inflight.current = false; setBusy(false);
    }
  }

  return html`<div class="screen rewards-screen">
    <${Header} back title="Rewards" />

    <section class="points-block">
      <p class="muted">Your points</p>
      <p class="stat">${points}</p>
      <div class="row gap-sm wrap" style="margin-top:10px">
        <button class="btn btn-primary btn-sm" onClick=${() => openLogSheet()}><${Icon} name="plus" size=${18} /> Log recycling</button>
        <button class="btn btn-ghost btn-sm" onClick=${() => navigate('activity')}>Points history</button>
      </div>
    </section>

    ${env.api && account.status !== 'signedIn' && html`<p class="note"><${Icon} name="info" size=${18} /> <span>Sign in to see your points and redeem rewards. <button class="link-btn" onClick=${() => requireSignIn()}>Sign in</button></span></p>`}
    <p class="note"><${Icon} name="info" size=${18} /> <span>These rewards are demos. No shop or retailer is involved and nothing can be used in real life. Spending points never changes your leaderboard rank.</span></p>

    <section class="section">
      <h2>Catalogue</h2>
      <div class="list">
        ${REWARDS.map((r) => {
          const have = r.once && owned(r.id);
          const short = r.cost - points;
          const needVerified = r.needsVerifiedItems && verifiedItems < r.needsVerifiedItems ? r.needsVerifiedItems - verifiedItems : 0;
          return html`<div class="list-row reward-row" key=${r.id}>
            <span class="grow">
              <span class="row-title block">${r.name}</span>
              <span class="row-sub block">${r.blurb}</span>
              <span class="row gap-sm wrap" style="margin-top:4px"><span class="tag">${KIND[r.kind] || r.kind}</span><${DemoTag}>Demo<//>${r.needsVerifiedItems ? html`<span class="tag">Needs ${r.needsVerifiedItems} verified items</span>` : ''}</span>
            </span>
            <span class="reward-buy">
              <strong class="cost">${r.cost} points</strong>
              ${have ? html`<button class="btn btn-ghost btn-sm" disabled>Owned</button>`
                : html`<button class="btn btn-primary btn-sm" disabled=${short > 0 || needVerified > 0} onClick=${() => { setError(''); setConfirm(r); }}>${short > 0 ? `${short} more needed` : needVerified > 0 ? `${needVerified} more verified` : 'Redeem'}</button>`}
            </span>
          </div>`;
        })}
      </div>
    </section>

    ${s.redemptions.length > 0 && html`<section class="section">
      <h2>Your rewards</h2>
      <div class="list">
        ${s.redemptions.map((red) => {
          const r = REWARDS.find((x) => x.id === red.rewardId);
          return html`<div class="list-row" key=${red.id}>
            <div class="grow"><span class="row-title block">${r?.name}</span><span class="row-sub">${relTime(red.ts)}${red.code ? html` · code <span class="mono">${red.code}</span>` : ''}</span></div>
          </div>`;
        })}
      </div>
    </section>`}

    <${Sheet} open=${!!confirm} onClose=${() => setConfirm(null)} dismissable=${!busy || auth.waiting} title="Redeem this reward?">
      ${confirm && html`<div class="stack">
        <div><strong>${confirm.name}</strong><p class="muted small">${confirm.partner || 'RECYCL IT! badge'}</p></div>
        <ul class="list summary">
          <li><span class="grow">Cost</span><strong>${confirm.cost} points</strong></li>
          <li><span class="grow">Balance after</span><strong>${points - confirm.cost} points</strong></li>
          <li><span class="grow">Leaderboard rank</span><strong>Unchanged</strong></li>
        </ul>
        <p class="muted small">This is a demo reward. Nothing is charged, and the code can’t be used in a real shop.</p>
        ${error && html`<p class="note tone-peach" role="alert">${error}</p>`}
        ${auth.panel}
        ${!auth.waiting && html`<div class="row gap">
          <button class="btn btn-ghost" disabled=${busy} onClick=${() => setConfirm(null)}>Cancel</button>
          <button class="btn btn-primary" disabled=${busy} onClick=${doRedeem}>${busy ? (auth.busy ? 'Waiting for your device…' : 'Redeeming…') : auth.failed ? 'Try again' : 'Confirm and redeem'}</button>
        </div>`}
        <p class="muted small">You’ll be asked to unlock your device to confirm it’s you.</p>
      </div>`}
    <//>

    <${Sheet} open=${!!done} onClose=${() => setDone(null)} title="Redeemed">
      ${done && html`<div class="stack">
        <p><strong>${done.reward.name}</strong></p>
        ${done.redemption.code ? html`<p>Your demo code: <span class="mono code-box">${done.redemption.code}</span></p>` : html`<p>The badge is now on your profile.</p>`}
        <p class="muted small">${done.reward.cost} points spent. Your leaderboard position hasn’t changed.</p>
        <${SimulatedNote} method=${done.method} />
        <button class="btn btn-primary" onClick=${() => setDone(null)}>Done</button>
      </div>`}
    <//>
  </div>`;
}
