import { html, useState } from '../lib.js';
import { Icon, Avatar, Sheet, StateCard, DemoTag, toast } from '../ui.js';
import { useStore } from '../store.js';
import { createChallenge, respondChallenge, leaveChallenge } from '../services/index.js';
import { challengeRows, challengeTitle, challengeDates, challengeWindow, resultMessage } from '../logic/social.js';
import { timeLeft, timeUntil, fmtRangeZ } from '../logic/zurich.js';

const LEVELS = {
  self: { label: 'Self-reported', tag: 'tag-self', blurb: 'Counts every eligible item people log. Verified items are marked.' },
  verified: { label: 'Verified only', tag: 'tag-verified', blurb: 'Counts only items confirmed with a station receipt code.' },
};

const RULES = [
  'Only eligible recyclables count (glass, PET, aluminium, paper and so on). Ordinary rubbish in a bin never counts.',
  'Only items logged after the challenge starts and after you join count.',
  'Each log counts once — duplicates are blocked.',
  'Everyone is measured the same way (see the level above). Ranking uses items, never points or lifetime totals.',
  'Rewards you’ve already earned are separate and unaffected. Dates and times use Europe/Zurich.',
];

const myEntry = (ch) => ch.participants.find((p) => p.userId === 'me');

function Bar({ value, max, tone }) {
  return html`<div class=${`bar tone-${tone}`} role="presentation"><span style=${`width:${max ? Math.round((value / max) * 100) : 0}%`}></span></div>`;
}

function ChallengeCard({ ch, now, activities, nick, onOpen }) {
  const rows = challengeRows(ch, activities, now, nick);
  const mine = rows.find((r) => r.isMe);
  const me = myEntry(ch);
  const ended = ch.status === 'ended';
  return html`<button class="list-row challenge-card" onClick=${() => onOpen(ch.id)}>
    <div class="row between center gap-sm wrap"><strong>${challengeTitle(ch)}</strong><span class=${`tag ${LEVELS[ch.level].tag}`}>${LEVELS[ch.level].label}</span></div>
    <p class="small muted">${challengeDates(ch)} · ${ended ? 'Finished' : ch.status === 'upcoming' ? timeUntil(ch.start, now) : timeLeft(ch.end, now)}</p>
    <div class="row between center small">
      <span class="avatar-stack">${ch.participants.slice(0, 5).map((p) => html`<${Avatar} avatar=${p.user.avatar} size=${28} />`)}</span>
      <span>${me.status === 'invited' ? html`<span class="tag tag-pending">Invitation</span>` : mine ? html`<strong>#${(ended && ch.result?.ranking.find((r) => r.isMe)?.rank) || mine.rank}</strong> · ${mine.score} items` : html`<span class="muted">Not taking part</span>`}</span>
    </div>
  </button>`;
}

function Participants({ rows, level, ended }) {
  const max = Math.max(1, ...rows.map((r) => r.score));
  return html`<ol class="board" aria-label="Challenge standings">
    ${rows.map((r) => html`<li class=${`board-row challenge-row ${r.isMe ? 'me' : ''}`} key=${r.userId}>
      <span class="rank">${r.rank}</span>
      <span class="nick-col"><span class="row gap-sm center"><${Avatar} avatar=${r.avatar} size=${28} /><span class="nick">${r.name}${r.isMe ? ' (you)' : ''}</span>${r.demo && html`<${DemoTag}>Simulated<//>`}</span>
        <${Bar} value=${r.score} max=${max} tone=${r.isMe ? 'mint' : 'sky'} />
        ${level === 'self' && html`<span class="small muted block">${r.verified} verified · ${r.selfReported} self-reported</span>`}</span>
      <span class="count"><strong>${r.score}</strong> <span class="small muted">items</span></span>
    </li>`)}
  </ol>`;
}

function ChallengeSheet({ id, data, onClose, refresh }) {
  const s = useStore();
  const ch = data.challenges.find((c) => c.id === id);
  const [mode, setMode] = useState('view');
  const [busy, setBusy] = useState(false);
  if (!ch) return null;
  const me = myEntry(ch);
  const ended = ch.status === 'ended';
  const rows = ended && ch.result ? ch.result.ranking : challengeRows(ch, s.activities, data.now, s.social.nickname);
  const mine = rows.find((r) => r.isMe);
  const invited = ch.participants.filter((p) => p.status === 'invited' && p.userId !== 'me');
  const badge = s.social.badges.find((b) => b.challengeId === ch.id);

  async function respond(accept) {
    setBusy(true);
    try {
      const r = await respondChallenge({ id: ch.id, accept });
      if (!r.ok) toast(r.error, 'peach'); else toast(accept ? 'You’ve joined. Items you log from now on count.' : 'Invitation declined');
      await refresh(); setMode('view');
      if (!accept) onClose();
    } catch (e) { toast(e.message, 'peach'); } finally { setBusy(false); }
  }
  async function leave() {
    setBusy(true);
    try { const r = await leaveChallenge({ id: ch.id }); if (!r.ok) toast(r.error, 'peach'); else toast('You left the challenge'); await refresh(); onClose(); } catch (e) { toast(e.message, 'peach'); } finally { setBusy(false); }
  }

  return html`<${Sheet} open=${true} onClose=${onClose} title=${ended ? 'Results' : mode === 'join' ? 'Join this challenge?' : challengeTitle(ch)}>
    <div class="stack">
      <div class="row gap-sm wrap"><span class=${`tag ${LEVELS[ch.level].tag}`}>${LEVELS[ch.level].label}</span><span class="tag">${ch.kind === 'week' ? 'Weekly' : 'Monthly'}</span></div>
      <p><${Icon} name="clock" size=${18} /> ${challengeDates(ch)} <span class="muted small block">${ended ? 'Finished' : ch.status === 'upcoming' ? `${timeUntil(ch.start, data.now)} · starts at midnight`: timeLeft(ch.end, data.now)} · Europe/Zurich time</span></p>
      <p class="muted small">${LEVELS[ch.level].blurb}</p>

      ${mode === 'join' && html`<section class="note stack-sm">
        <h3>What other participants will see</h3>
        <ul class="check-list"><li>Your nickname and avatar</li><li>How many eligible items you log during this challenge, split into verified and self-reported</li><li>Your rank</li></ul>
        <h3>What they won’t see</h3>
        <ul class="check-list no"><li>Where or when you recycled</li><li>Your totals outside this challenge, points or rewards</li><li>Your streaks, unless you share them with friends separately</li></ul>
        <p class="small">Counting starts when you join: earlier activity doesn’t count.</p>
        <div class="row gap"><button class="btn btn-ghost" disabled=${busy} onClick=${() => respond(false)}>Decline</button><button class="btn btn-primary" disabled=${busy} onClick=${() => respond(true)}>Join challenge</button></div></section>`}

      ${mode === 'view' && me.status === 'invited' && !ended && html`<section class="note stack-sm"><p><strong>You’re invited.</strong> Joining is up to you.</p>
        <button class="btn btn-primary btn-block" onClick=${() => setMode('join')}>See details & join</button>
        <button class="btn btn-ghost btn-block" disabled=${busy} onClick=${() => respond(false)}>Decline</button></section>`}

      ${ended && html`<section class="result-card stack-sm">
          <h3>${mine ? 'Challenge finished' : 'This challenge has finished'}</h3>
        ${mine && html`<p>${resultMessage(mine.rank, mine.score, rows.length)}</p>`}
        ${badge && html`<p><span class="tag tag-verified">Badge earned: ${badge.name}</span></p>`}
        ${mine && mine.score === 0 && html`<p class="muted small">Badges need at least one eligible item.</p>`}
        <p class="muted small">Rewards and points you’ve already earned are separate and unchanged.</p></section>`}

      ${me.status !== 'invited' && html`${rows.length > 0 ? html`<${Participants} rows=${rows} level=${ch.level} ended=${ended} />` : html`<p class="muted">No one has joined yet.</p>`}
        ${invited.length > 0 && html`<p class="small muted">Invited, not yet replied: ${invited.map((p) => p.user.nickname).join(', ')}</p>`}`}

      ${me.status === 'joined' && !ended && mine && html`<p class="note tone-mint small"><${Icon} name="check" size=${18} /> You’re in. Your progress counts only items logged after you joined.</p>`}

      <details class="card"><summary><strong>How counting works</strong></summary><ul class="small" style="margin-top:10px">${RULES.map((r) => html`<li>${r}</li>`)}</ul></details>
      ${me.status === 'joined' && !ended && html`<button class="btn btn-ghost btn-sm danger" disabled=${busy} onClick=${leave}>Leave challenge</button>`}
    </div>
  <//>`;
}

function CreateSheet({ friends, now, onClose, onCreated }) {
  const [kind, setKind] = useState('week');
  const [when, setWhen] = useState('this');
  const [level, setLevel] = useState('self');
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const win = challengeWindow(kind, when, now);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit(e) {
    e.preventDefault(); setError('');
    if (!picked.length) { setError('Pick at least one friend to invite.'); return; }
    setBusy(true);
    try { const r = await createChallenge({ kind, when, level, inviteIds: picked, name }); if (!r.ok) { setError(r.error); return; } toast('Challenge created — invitations sent'); onCreated(r.id); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return html`<${Sheet} open=${true} onClose=${onClose} title="New challenge">
    <form class="stack" onSubmit=${submit}>
      <fieldset class="issue-list"><legend class="strong">How long?</legend>
        ${[['week', 'this', 'This week'], ['week', 'next', 'Next week'], ['month', 'this', 'This month'], ['month', 'next', 'Next month']].map(([k, w, label]) => html`<label class=${`issue-option ${kind === k && when === w ? 'selected' : ''}`}><input type="radio" name="when" checked=${kind === k && when === w} onChange=${() => { setKind(k); setWhen(w); }} /><span class="grow"><strong>${label}</strong><span class="muted small block">${fmtRangeZ(challengeWindow(k, w, now).start, challengeWindow(k, w, now).end)}</span></span></label>`)}</fieldset>
      <fieldset class="issue-list"><legend class="strong">How does it count?</legend>
        ${Object.entries(LEVELS).map(([k, l]) => html`<label class=${`issue-option ${level === k ? 'selected' : ''}`}><input type="radio" name="level" checked=${level === k} onChange=${() => setLevel(k)} /><span class="grow"><strong>${l.label}</strong><span class="muted small block">${l.blurb}</span></span></label>`)}</fieldset>
      <fieldset class="issue-list"><legend class="strong">Invite friends</legend>
        ${friends.map((f) => html`<label class=${`issue-option ${picked.includes(f.id) ? 'selected' : ''}`}><input type="checkbox" checked=${picked.includes(f.id)} onChange=${() => toggle(f.id)} /><${Avatar} avatar=${f.avatar} size=${32} /><span class="grow strong">${f.nickname}</span></label>`)}</fieldset>
      <label class="field"><span class="strong">Name <span class="muted">(optional)</span></span><input type="text" maxlength="40" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="e.g. Bubble race" /></label>
      <p class="note tone-sky small"><${Icon} name="info" size=${18} /> <span>Friends must accept before they join, and only items logged after they join count. Ranking is by items — never by points.</span></p>
      ${error && html`<p class="note tone-peach" role="alert">${error}</p>`}
      <button class="btn btn-primary btn-block" type="submit" disabled=${busy}>${busy ? 'Creating…' : 'Create & invite'}</button>
    </form>
  <//>`;
}

export function ChallengesTab({ data, refresh }) {
  const s = useStore();
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const nick = s.social.nickname;
  const mine = data.challenges.filter((c) => myEntry(c));
  const invited = mine.filter((c) => myEntry(c).status === 'invited' && c.status !== 'ended');
  const active = mine.filter((c) => myEntry(c).status === 'joined' && c.status === 'active');
  const upcoming = mine.filter((c) => myEntry(c).status === 'joined' && c.status === 'upcoming');
  const finished = mine.filter((c) => c.status === 'ended' && myEntry(c).status === 'joined');
  const card = (c) => html`<${ChallengeCard} key=${c.id} ch=${c} now=${data.now} activities=${s.activities} nick=${nick} onOpen=${setOpenId} />`;

  return html`<div class="stack">
    <button class="btn btn-primary btn-block" disabled=${data.friends.length === 0} onClick=${() => setCreating(true)}><${Icon} name="plus" /> New challenge</button>
    ${data.friends.length === 0 && html`<p class="muted small center">Add a friend first to start a challenge.</p>`}
    ${invited.length > 0 && html`<section class="section"><h2>Invitations</h2><div class="list">${invited.map(card)}</div></section>`}
    <section class="section"><h2>Active</h2>${active.length ? html`<div class="list">${active.map(card)}</div>` : html`<p class="muted">No active challenges. Start a weekly or monthly one with a friend.</p>`}</section>
    ${upcoming.length > 0 && html`<section class="section"><h2>Coming up</h2><div class="list">${upcoming.map(card)}</div></section>`}
    ${finished.length > 0 && html`<section class="section"><h2>Finished</h2><div class="list">${finished.map(card)}</div></section>`}
    <p class="muted small">Challenge rankings use eligible items logged during the challenge only. Self-reported and verified items are labelled and compared fairly.</p>
    ${openId && html`<${ChallengeSheet} id=${openId} data=${data} onClose=${() => setOpenId(null)} refresh=${refresh} />`}
    ${creating && html`<${CreateSheet} friends=${data.friends} now=${data.now} onClose=${() => setCreating(false)} onCreated=${async (id) => { setCreating(false); await refresh(); setOpenId(id); }} />`}
  </div>`;
}
