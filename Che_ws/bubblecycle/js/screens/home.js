import { html } from '../lib.js';
import { useStore, updateProfile, getBalance, storageOk } from '../store.js';
import { Icon, ProgressRing } from '../ui.js';
import { navigate } from '../router.js';
import { periodRange, countInRange } from '../logic/activity.js';
import { TIPS } from '../data/misc.js';
import { openLogSheet } from './logsheet.js';
import { ReminderBanner } from './streaks.js';
import { zParts, startOfDayZ } from '../logic/zurich.js';
import { questStatuses } from '../logic/quests.js';
import { BOTTLEDEX } from '../data/bottledex.js';
import { nowTs } from '../logic/clock.js';

function greeting() {
  const h = zParts(nowTs()).h;
  return h < 11 ? 'Good morning' : h < 17 ? 'Hello' : 'Good evening';
}

function ActionRow({ icon, title, sub, to }) {
  return html`<button class="list-row" onClick=${() => navigate(to)}>
    <${Icon} name=${icon} size=${24} />
    <span class="grow"><span class="row-title block">${title}</span><span class="row-sub">${sub}</span></span>
    <${Icon} name="chevron" size=${20} />
  </button>`;
}

export default function Home() {
  const s = useStore();
  const week = periodRange('week', 0);
  const { items, verified } = countInRange(s.activities, week);
  const goal = s.profile.weeklyGoal;
  const points = getBalance();
  const tip = TIPS[Math.floor(startOfDayZ(nowTs()) / 86400000) % TIPS.length];
  const name = s.profile.nickname;
  const quests = questStatuses(s);
  const dexFound = BOTTLEDEX.filter((e) => s.collection[e.id]).length;

  return html`<div class="screen home">
    <header>
      <h1>${greeting()}${name ? `, ${name}` : ''}</h1>
      <p class="muted">Rotkreuz, Canton Zug</p>
    </header>

    <${ReminderBanner} />
    ${!storageOk && html`<p class="note tone-peach" role="alert"><${Icon} name="alert" size=${18} /> <span>Your browser is blocking local storage, so what you log won’t be saved after you close the app. Allow site data in your browser settings to keep it.</span></p>`}

    ${!s.profile.welcomeDismissed && html`<div class="note"><div>
      <p>BubbleCycle is a demo for Rotkreuz. Some places and products are sample data, and what you log stays on this device.</p>
      <p class="row gap-sm" style="margin-top:6px"><button class="link-btn" onClick=${() => { updateProfile({ welcomeDismissed: true }); navigate('profile'); }}>Set up your profile</button><button class="link-btn" onClick=${() => updateProfile({ welcomeDismissed: true })}>Dismiss</button></p>
    </div></div>`}

    <section class="section" aria-labelledby="week-h">
      <h2 id="week-h">This week</h2>
      <div class="progress-body">
        <${ProgressRing} value=${items} max=${goal} size=${104}>
          <strong class="ring-num">${items}</strong><span class="small muted">of ${goal}</span>
        <//>
        <div class="stack-sm">
          <p class="lead">${items === 0 ? 'Nothing logged yet this week' : `You logged ${items} item${items === 1 ? '' : 's'} this week`}</p>
          <p class="muted small">${items >= goal ? 'You’ve reached your goal.' : `${goal - items} to go for your goal of ${goal}.`}${items > 0 ? ` ${verified} verified, ${items - verified} self-reported.` : ''}</p>
          <button class="btn btn-primary btn-sm" style="align-self:flex-start" onClick=${() => openLogSheet()}><${Icon} name="plus" size=${18} /> Log recycling</button>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="do-h">
      <h2 id="do-h">What do you need?</h2>
      <div class="list">
        <${ActionRow} icon="pin" title="Find a recycling point" sub="Stations and bins in Rotkreuz" to="map" />
        <${ActionRow} icon="scan" title="Scan an item" sub="See how to recycle its packaging" to="scan" />
        <${ActionRow} icon="search" title="Find a snack or drink" sub="Compare packaging and diet before you buy" to="discover" />
        <${ActionRow} icon="plus" title="Add a missing place" sub="A station or bin that isn’t on the map yet" to="add" />
      </div>
    </section>

    <section class="section" aria-labelledby="you-h">
      <h2 id="you-h">Yours</h2>
      <div class="list">
        <${ActionRow} icon="gift" title="Rewards" sub=${`${points} points to spend`} to="rewards" />
        <${ActionRow} icon="trophy" title="Leaderboard" sub=${s.profile.leaderboardOptIn ? 'See where you rank this week' : 'Weekly and monthly, opt-in'} to="leaderboard" />
        <${ActionRow} icon="star" title="Monthly quests" sub=${quests.ready.length > 0 ? `${quests.ready.length} ready to claim (${quests.claimable} points)` : `${quests.list.filter((q) => q.done).length} of ${quests.list.length} done this month`} to="quests" />
        <${ActionRow} icon="leaf" title="Bottledex" sub=${`${dexFound} of ${BOTTLEDEX.length} container types found`} to="collection" />
        <${ActionRow} icon="clock" title="Activity" sub="Your logs and points" to="activity" />
      </div>
    </section>

    <p class="tip"><strong>Tip</strong> ${tip}</p>
  </div>`;
}
