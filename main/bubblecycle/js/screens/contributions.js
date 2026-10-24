import { html, useEffect, useState } from '../lib.js';
import { Header, Icon, Skeleton, StateCard } from '../ui.js';
import { listContributions } from '../services/index.js';
import { useStore, getContributorId, syncContributionRewards } from '../store.js';
import { statusMessage, itemTitle } from '../logic/community.js';
import { config } from '../config.js';
import { relTime } from '../utils.js';
import { navigate } from '../router.js';

export default function Contributions() {
  useStore();
  const [state, setState] = useState({ status: 'loading', items: [] });
  const [reload, setReload] = useState(0);
  const [bonus, setBonus] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const got = await syncContributionRewards();
        const items = await listContributions({ contributorId: getContributorId() });
        if (alive) { setBonus(got); setState({ status: 'ready', items }); }
      } catch (e) { if (alive) setState({ status: 'error', items: [], error: e.message }); }
    })();
    return () => { alive = false; };
  }, [reload]);

  const c = config.contribution;
  return html`<div class="screen contributions-screen">
    <${Header} back title="My contributions" subtitle="Places and feedback you’ve shared" />
    <p class="note small"><${Icon} name="info" size=${18} /> <span>${config.pilot.lockCatalogue ? html`Confirming a place earns <strong>${c.confirm} points</strong> (up to ${c.confirmsPerDay} a day).` : html`Approved places earn <strong>${c.placeApproved} points</strong> (+${c.photoBonus} with a photo), accepted fixes ${c.changeAccepted}, and confirming a place ${c.confirm} (up to ${c.confirmsPerDay} a day).`} These are spendable points only. They don’t count as recycling and don’t change the leaderboard.</span></p>
    ${bonus > 0 && html`<p class="note tone-mint" role="status">You earned ${bonus} points from reviewed contributions.</p>`}

    ${state.status === 'loading' && html`<${Skeleton} lines=${3} /><${Skeleton} lines=${3} />`}
    ${state.status === 'error' && html`<${StateCard} icon="alert" tone="peach" title="Couldn’t load your contributions" action=${html`<button class="btn btn-primary btn-sm" onClick=${() => { setState({ status: 'loading', items: [] }); setReload((x) => x + 1); }}>Try again</button>`}>${state.error}<//>`}
    ${state.status === 'ready' && state.items.length === 0 && html`<${StateCard} icon="pin" tone="mint" title="Nothing yet" action=${config.pilot.lockCatalogue ? null : html`<button class="btn btn-primary btn-sm" onClick=${() => navigate('add')}><${Icon} name="plus" size=${18} /> Add a place</button>`}>${config.pilot.lockCatalogue ? 'Confirming that the recycling point is still there, or reporting a problem with it, shows up here.' : 'If a recycling point or bin is missing from the map, you can add it.'}<//>`}
    ${state.status === 'ready' && state.items.length > 0 && html`<ul class="timeline">
      ${state.items.map((i) => {
        const m = statusMessage(i);
        return html`<li class="contrib stack-sm" key=${i.id}>
          <div class="row between center gap-sm wrap">
            <strong>${itemTitle(i, i.locationName)}</strong>
            <span class=${`tag tone-${m.tone}`}>${m.title}</span>
          </div>
          <p class="small muted">${relTime(i.createdAt)}${i.kind === 'new_place' && i.payload.name ? ` · ${i.payload.name}` : ''}</p>
          <p class="small">${m.text}</p>
        </li>`;
      })}
    </ul>`}

    <p class="muted small center">Reviewer? <button class="link-btn small" onClick=${() => navigate('admin')}>Open the demo admin view</button></p>
  </div>`;
}
