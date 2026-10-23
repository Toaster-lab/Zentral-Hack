import { html, useState } from '../lib.js';
import { Header, Icon, Sheet, DemoTag, toast } from '../ui.js';
import { useStore, getBalance, redeem } from '../store.js';
import { REWARDS } from '../data/misc.js';
import { navigate } from '../router.js';
import { relTime } from '../utils.js';
import { openLogSheet } from './logsheet.js';

const KIND = { badge: 'Badge', discount: 'Discount', voucher: 'Voucher' };

export default function Rewards() {
  const s = useStore();
  const points = getBalance();
  const [confirm, setConfirm] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const owned = (id) => s.redemptions.some((r) => r.rewardId === id);

  function doRedeem() {
    const res = redeem(confirm.id);
    if (!res.ok) { setError(res.error); return; }
    setConfirm(null); setDone(res); setError('');
    toast(`Redeemed: ${res.reward.name}`);
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

    <p class="note"><${Icon} name="info" size=${18} /> <span>These rewards are demos. No shop or retailer is involved and nothing can be used in real life. Spending points never changes your leaderboard rank.</span></p>

    <section class="section">
      <h2>Catalogue</h2>
      <div class="list">
        ${REWARDS.map((r) => {
          const have = r.once && owned(r.id);
          const short = r.cost - points;
          return html`<div class="list-row reward-row" key=${r.id}>
            <span class="grow">
              <span class="row-title block">${r.name}</span>
              <span class="row-sub block">${r.blurb}</span>
              <span class="row gap-sm wrap" style="margin-top:4px"><span class="tag">${KIND[r.kind] || r.kind}</span><${DemoTag}>Demo<//></span>
            </span>
            <span class="reward-buy">
              <strong class="cost">${r.cost} points</strong>
              ${have ? html`<button class="btn btn-ghost btn-sm" disabled>Owned</button>`
                : html`<button class="btn btn-primary btn-sm" disabled=${short > 0} onClick=${() => { setError(''); setConfirm(r); }}>${short > 0 ? `${short} more needed` : 'Redeem'}</button>`}
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

    <${Sheet} open=${!!confirm} onClose=${() => setConfirm(null)} title="Redeem this reward?">
      ${confirm && html`<div class="stack">
        <div><strong>${confirm.name}</strong><p class="muted small">${confirm.partner || 'BubbleCycle badge'}</p></div>
        <ul class="list summary">
          <li><span class="grow">Cost</span><strong>${confirm.cost} points</strong></li>
          <li><span class="grow">Balance after</span><strong>${points - confirm.cost} points</strong></li>
          <li><span class="grow">Leaderboard rank</span><strong>Unchanged</strong></li>
        </ul>
        <p class="muted small">This is a demo reward. Nothing is charged, and the code can’t be used in a real shop.</p>
        ${error && html`<p class="note tone-peach" role="alert">${error}</p>`}
        <div class="row gap">
          <button class="btn btn-ghost" onClick=${() => setConfirm(null)}>Cancel</button>
          <button class="btn btn-primary" onClick=${doRedeem}>Redeem</button>
        </div>
      </div>`}
    <//>

    <${Sheet} open=${!!done} onClose=${() => setDone(null)} title="Redeemed">
      ${done && html`<div class="stack">
        <p><strong>${done.reward.name}</strong></p>
        ${done.redemption.code ? html`<p>Your demo code: <span class="mono code-box">${done.redemption.code}</span></p>` : html`<p>The badge is now on your profile.</p>`}
        <p class="muted small">${done.reward.cost} points spent. Your leaderboard position hasn’t changed.</p>
        <button class="btn btn-primary" onClick=${() => setDone(null)}>Done</button>
      </div>`}
    <//>
  </div>`;
}
