import { html } from '../lib.js';
import { Header, Icon, toast } from '../ui.js';
import { useStore, claimQuest } from '../store.js';
import { questStatuses } from '../logic/quests.js';
import { timeLeft } from '../logic/zurich.js';
import { nowTs } from '../logic/clock.js';
import { navigate } from '../router.js';

export default function Quests() {
  const s = useStore();
  const { range, list, claimable } = questStatuses(s);
  const done = list.filter((q) => q.done).length;

  function claim(q) {
    const r = claimQuest({ claimId: q.claimId, points: q.points, title: q.title });
    toast(r.ok ? `Claimed ${q.points} points` : r.error);
  }

  return html`<div class="screen quests-screen">
    <${Header} back title="Monthly quests" subtitle=${`${range.label} · ${timeLeft(range.end, nowTs())}`} />

    <section class="section">
      <p class="lead">${done} of ${list.length} done${claimable > 0 ? ` · ${claimable} points ready to claim` : ''}</p>
      <p class="muted small">Quests are optional goals with a one-off bonus of spendable points. They reset every month (Europe/Zurich time). They don’t ask you to buy anything or make extra trips, and bonus points never change your recycling counts or leaderboard rank.</p>
    </section>

    <div class="list">
      ${list.map((q) => html`<div class="list-row quest-row" key=${q.id}>
        <span class="grow">
          <span class="row-title block">${q.title}</span>
          <span class="row-sub block">${q.desc}</span>
          <span class="quest-progress">
            <span class="bar" role="progressbar" aria-valuemin="0" aria-valuemax=${q.target} aria-valuenow=${q.progress} aria-label=${`${q.title}: ${q.progress} of ${q.target}`}><span style=${`width:${Math.round((q.progress / q.target) * 100)}%`}></span></span>
            <span class="small">${q.progress} / ${q.target} ${q.unit}</span>
          </span>
        </span>
        <span class="quest-side">
          <strong class="cost">+${q.points}</strong>
          ${q.claimed ? html`<span class="tag tag-verified">Claimed</span>`
            : q.done ? html`<button class="btn btn-primary btn-sm" onClick=${() => claim(q)}>Claim</button>`
            : html`<span class="tag">In progress</span>`}
        </span>
      </div>`)}
    </div>

    <div class="list">
      <button class="list-row" onClick=${() => navigate('collection')}><${Icon} name="leaf" size=${22} /><span class="grow"><span class="row-title block">Bottledex</span><span class="row-sub">Find container types by scanning</span></span><${Icon} name="chevron" size=${20} /></button>
      <button class="list-row" onClick=${() => navigate('scan')}><${Icon} name="scan" size=${22} /><span class="grow"><span class="row-title block">Scan an item</span><span class="row-sub">Counts towards two of these quests</span></span><${Icon} name="chevron" size=${20} /></button>
    </div>
  </div>`;
}
