import { html } from '../lib.js';
import { Header, Icon, StateCard } from '../ui.js';
import { useStore, getBalance } from '../store.js';
import { relTime } from '../utils.js';
import { openLogSheet } from './logsheet.js';
import { CheckinList, OutboxList } from './checkinlist.js';
import { EVIDENCE } from '../logic/evidence.js';

export default function Activity() {
  const s = useStore();
  return html`<div class="screen activity-screen">
    <${Header} back title="Activity" subtitle=${`${getBalance()} points available`} />
    <${OutboxList} />
    <${CheckinList} />
    ${s.ledger.length === 0
      ? html`<${StateCard} icon="leaf" tone="mint" title="Nothing here yet" action=${html`<button class="btn btn-primary btn-sm" onClick=${() => openLogSheet()}>Log your first recycling</button>`}>Your recycling logs and rewards will show up here.<//>`
      : html`<ul class="timeline">
          ${s.ledger.map((l) => html`<li class="timeline-row" key=${l.id}>
            <span class=${`tl-icon ${l.points >= 0 ? 'tone-mint' : 'tone-lavender'}`}><${Icon} name=${l.type === 'redeem' ? 'gift' : l.type === 'bonus' ? 'star' : l.type === 'contribute' || l.type === 'confirm' ? 'pin' : l.type === 'quest' ? 'star' : 'leaf'} size=${20} /></span>
            <div class="grow">
              <p class="strong">${l.label}</p>
              <p class="small muted">${relTime(l.ts)}
                ${l.verification && html` · <span class=${`tag ${l.verification === 'verified' ? 'tag-verified' : 'tag-self'}`}>${l.verification === 'verified' ? 'Verified' : 'Self-reported'}</span>`}
                ${l.evidence === 'location' && html` <span class="tag tag-self">${EVIDENCE.location.label}</span>`}</p>
            </div>
            <strong class=${l.points >= 0 ? 'pos' : 'neg'}>${l.points >= 0 ? '+' : ''}${l.points}</strong>
          </li>`)}
        </ul>`}
  </div>`;
}
