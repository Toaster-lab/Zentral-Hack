import { html, useEffect, useState } from '../lib.js';
import { Header, Icon, Segmented, Skeleton, StateCard, Toggle, DemoTag } from '../ui.js';
import { useStore } from '../store.js';
import { periodRange, countInRange, buildLeaderboard } from '../logic/activity.js';
import { leaderboardPeers, isDemo } from '../services/index.js';
import { navigate } from '../router.js';
import { config } from '../config.js';
import { env } from '../env.js';
import { useAccount } from '../services/account.js';

const MEDALS = {};

export default function Leaderboard() {
  const s = useStore();
  const [kind, setKind] = useState('week');
  const [offset, setOffset] = useState(0);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [state, setState] = useState({ status: 'loading', peers: [] });
  const [reload, setReload] = useState(0);
  const range = periodRange(kind, offset);
  const account = useAccount();

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading', peers: [] });
    leaderboardPeers({ ...range, offset })
      .then((peers) => alive && setState({ status: 'ready', peers }))
      .catch((e) => alive && setState({ status: 'error', peers: [], error: e.message }));
    return () => { alive = false; };
  }, [range.key, reload]);

  const mine = countInRange(s.activities, range);
  // With the server, the board (including your own row) is counted there; otherwise your row is added on this device.
  const optedIn = env.api ? account.user?.leaderboardOptIn : s.profile.leaderboardOptIn && s.profile.nickname;
  const me = optedIn && !env.api ? { nickname: s.profile.nickname, items: mine.items, verified: mine.verified, isMe: true } : null;
  const rows = state.status === 'ready' ? buildLeaderboard(state.peers, me, verifiedOnly) : [];
  const periodName = kind === 'week' ? (offset === 0 ? 'This week' : 'Last week') : (offset === 0 ? 'This month' : 'Last month');

  return html`<div class="screen leaderboard-screen">
    <${Header} back title="Leaderboard" subtitle="Ranked by items recycled — not by points" />

    <div class="stack-sm">
      <${Segmented} label="Period type" value=${kind} onChange=${(k) => { setKind(k); setOffset(0); }}
        options=${[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} />
      <div class="row between center">
        <button class="icon-btn" aria-label="Previous period" disabled=${offset <= -1} onClick=${() => setOffset(-1)}><${Icon} name="back" /></button>
        <div class="center"><strong>${periodName}</strong><p class="small muted">${range.label}</p></div>
        <button class="icon-btn" aria-label="Next period" disabled=${offset >= 0} onClick=${() => setOffset(0)}><${Icon} name="chevron" /></button>
      </div>
    </div>

    <div class="metric">
      <p class="small"><strong>Metric:</strong> accepted recyclable items logged in ${periodName.toLowerCase()} (${range.label}).</p>
      <${Toggle} checked=${verifiedOnly} onChange=${setVerifiedOnly} label="Count verified items only" description="Verified = confirmed with a station receipt code." />
    </div>

    ${!optedIn && html`<div class="note">
      <p><strong>You’re not on the leaderboard.</strong> You recycled <strong>${verifiedOnly ? mine.verified : mine.items}</strong> items in this period — that stays private unless you opt in with a nickname.</p>
      <button class="btn btn-primary btn-sm" onClick=${() => navigate('profile')}>Opt in on Profile</button>
    </div>`}

    ${state.status === 'loading' && html`<${Skeleton} lines=${5} />`}
    ${state.status === 'error' && html`<${StateCard} icon="alert" tone="peach" title="Leaderboard didn’t load" action=${html`<button class="btn btn-primary btn-sm" onClick=${() => setReload((x) => x + 1)}>Try again</button>`}>${state.error}<//>`}
    ${state.status === 'ready' && html`<ol class="board" aria-label=${`${periodName} leaderboard`}>
      ${rows.map((r) => html`<li class=${`board-row ${r.isMe ? 'me' : ''}`} key=${r.nickname}>
        <span class="rank" aria-label=${`Rank ${r.rank}`}>${MEDALS[r.rank] || r.rank}</span>
        <span class="nick-col">
          <span class="nick">${r.nickname}${r.isMe ? ' (you)' : ''} ${r.demo && html`<${DemoTag}>Demo<//>`}</span>
          ${!verifiedOnly && html`<span class="small muted block">${r.verified} verified · ${r.items - r.verified} self-reported</span>`}
        </span>
        <span class="count"><strong>${r.score}</strong> <span class="small muted">items</span></span>
      </li>`)}
    </ol>`}

    <details class="card fair-play">
      <summary><strong>How we keep it fair</strong></summary>
      <ul class="small">
        <li>Rankings use recycled item counts only. Points and redeemed rewards never affect your rank.</li>
        <li>Max ${config.limits.maxItemsPerLog} items per material in one log, ${config.limits.maxItemsPerDay} items and ${config.limits.maxLogsPerDay} logs per day. The same material and count again within ${config.limits.duplicateWindowMin} minutes is blocked as a likely duplicate.</li>
        <li>Self-reported items are shown separately from verified ones (receipt code). Use the toggle above to rank by verified items only.</li>
        ${isDemo('leaderboard') && html`<li>Other players here are fictional demo players, and limits are checked on your device. Run the RECYCL IT! server to have them enforced there.</li>`}
        ${!isDemo('leaderboard') && html`<li>Counts come from the server and include only activity it accepted. Check-ins held for review aren’t counted until they’re approved.</li>`}
      </ul>
    </details>
  </div>`;
}
