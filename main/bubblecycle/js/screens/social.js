import { html, useEffect, useState } from '../lib.js';
import { Header, Icon, Avatar, Segmented, Sheet, Skeleton, StateCard, Toggle, DemoTag, toast } from '../ui.js';
import { useSocialData } from './social-data.js';
import { ChallengesTab } from './challenges.js';
import { useMyStreaks } from './streaks.js';
import { useStore, updateSocial, updateSocialPrivacy, updateReminders, leaveSocial } from '../store.js';
import { findUser, sendRequest, respondRequest, cancelRequest, removeFriend, blockUser, unblockUser, reportUser } from '../services/index.js';
import { AVATAR_TONES, REPORT_REASONS, cleanUsername, usernameError, nicknameError, streakMessage } from '../logic/social.js';
import { DEMO_USERS } from '../data/social-demo.js';
import { clockOffset } from '../logic/clock.js';

const inviteLink = (username) => `${location.origin}${location.pathname}#/social?add=${encodeURIComponent(username)}`;

// ---- Profile setup (also used for editing) ---------------------------------------

function SetupForm({ initial, submitLabel, onSave, onCancel, onLeave }) {
  const profileNick = useStore().profile.nickname;
  const [nickname, setNickname] = useState(initial.nickname || profileNick || '');
  const [username, setUsername] = useState(initial.username || '');
  const [avatar, setAvatar] = useState(initial.avatar);
  const [share, setShare] = useState(Boolean(initial.privacy.totals || initial.privacy.streaks || initial.privacy.milestones));
  const [err, setErr] = useState({});

  function submit(e) {
    e.preventDefault();
    const u = cleanUsername(username); const n = nickname.trim();
    const errors = {};
    if (nicknameError(n)) errors.nickname = nicknameError(n);
    if (usernameError(u)) errors.username = usernameError(u);
    else if (u !== initial.username && DEMO_USERS.some((d) => d.username === u)) errors.username = 'That username is taken. Try another one.';
    setErr(errors);
    if (Object.keys(errors).length) return;
    onSave({ nickname: n, username: u, avatar: { tone: avatar.tone, initial: n[0].toUpperCase() }, privacy: { totals: share, streaks: share, milestones: share } });
  }

  return html`<form class="stack" onSubmit=${submit} novalidate>
    <div class="row gap center"><${Avatar} avatar=${{ ...avatar, initial: (nickname.trim()[0] || '?').toUpperCase() }} size=${64} label="Your avatar" /><div class="grow"><strong>${nickname.trim() || 'Your nickname'}</strong><p class="muted small">@${cleanUsername(username) || 'username'}</p></div></div>
    <fieldset class="avatar-picker"><legend class="strong">Avatar colour</legend>
            <div class="chip-wrap">${AVATAR_TONES.map((t) => html`<button type="button" class=${`tone-dot av-${t} ${avatar.tone === t ? 'selected' : ''}`} aria-label=${`Colour ${t}`} aria-pressed=${avatar.tone === t ? 'true' : 'false'} onClick=${() => setAvatar({ ...avatar, tone: t })}></button>`)}</div>
    </fieldset>
    <label class="field"><span class="strong">Nickname</span>
      <input type="text" maxlength="20" value=${nickname} onInput=${(e) => setNickname(e.target.value)} aria-invalid=${err.nickname ? 'true' : 'false'} />
      ${err.nickname ? html`<span class="note tone-peach small" role="alert">${err.nickname}</span>` : html`<span class="muted small">Shown to friends. Please don’t use your real name.</span>`}</label>
    <label class="field"><span class="strong">Username</span>
      <input type="text" maxlength="20" autocapitalize="none" autocomplete="off" value=${username} onInput=${(e) => setUsername(e.target.value)} placeholder="e.g. bubble_fan" aria-invalid=${err.username ? 'true' : 'false'} />
      ${err.username ? html`<span class="note tone-peach small" role="alert">${err.username}</span>` : html`<span class="muted small">Friends can find you only by typing this exactly.</span>`}</label>

    <section class="card-inset stack-sm">
      <h3 class="small-h">What can friends see?</h3>
      <p class="muted small">Off until you choose. You can change this any time.</p>
      <${Toggle} checked=${share} onChange=${setShare} label="Share my progress" description="Items recycled this week and your weekly streak. Never places or times." />
    </section>
    <p class="note tone-sky small"><${Icon} name="shield" size=${18} /> <span>Friends never see where or when you recycled. Challenges have their own rules, which are explained before you join.</span></p>
    <div class="row gap">${onCancel && html`<button type="button" class="btn btn-ghost" onClick=${onCancel}>Cancel</button>`}<button class="btn btn-primary" type="submit">${submitLabel}</button></div>
    ${onLeave && html`<button type="button" class="btn btn-ghost btn-sm danger" onClick=${onLeave}>Leave Social & delete my social profile</button>`}
  </form>`;
}

function Onboarding({ onDone }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  return html`<div class="stack">
    <section class="section">
      <h2>Recycle with friends</h2>
      <p>Add friends, join weekly or monthly challenges and keep a weekly streak. It is optional, and the rest of RECYCL IT! works without it.</p>
      <ul class="check-list">
        <li>No chat or messaging</li><li>You choose what friends can see</li><li>Places and times are never shared</li>
      </ul>
      ${!open && html`<button class="btn btn-primary" style="align-self:flex-start" onClick=${() => setOpen(true)}>Set up a social profile</button>`}
    </section>
    ${open && html`<section class="card"><${SetupForm} initial=${{ ...s.social }} submitLabel="Start" onSave=${(v) => { updateSocial({ ...v, enabled: true }); toast('Social profile created'); onDone?.(); }} onCancel=${() => setOpen(false)} /></section>`}
    <p class="note"><${Icon} name="info" size=${18} /> <span>Demo: the people here are simulated and labelled as such. Real friends need real accounts.</span></p>
  </div>`;
}

// ---- Friends ---------------------------------------------------------------------

function AddFriend({ me, initial, onChanged }) {
  const [text, setText] = useState(initial || '');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const link = inviteLink(me.username);

  async function search(q = text) {
    const u = cleanUsername(q);
    setBusy(true); setRes(null);
    try { setRes(await findUser({ username: u, myUsername: me.username })); } catch (e) { setRes({ status: 'error', error: e.message }); } finally { setBusy(false); }
  }
  useEffect(() => { if (initial) search(initial); }, []);

  async function act(fn, okMsg) {
    setBusy(true);
    try { const r = await fn(); if (!r.ok) toast(r.error, 'peach'); else { toast(okMsg); setRes(null); setText(''); onChanged(); } } catch (e) { toast(e.message, 'peach'); } finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); toast('Invite link copied'); } catch { toast('Couldn’t copy — select the link and copy it by hand', 'peach'); }
  }

  const msg = { none: 'No one has exactly that username. Usernames must match exactly, so double-check the spelling.', invalid: 'Usernames are 3–20 lowercase letters, numbers or underscores.', self: 'That’s your own username.' };
  return html`<section class="card stack">
    <h3>Add a friend</h3>
    <form class="row gap" onSubmit=${(e) => { e.preventDefault(); if (text.trim()) search(); }} role="search">
      <label class="search-field"><span class="at" aria-hidden="true">@</span><input type="text" autocapitalize="none" autocomplete="off" placeholder="exact username" value=${text} onInput=${(e) => setText(e.target.value)} aria-label="Friend’s exact username" /></label>
      <button class="btn btn-primary btn-sm" style="flex:none" type="submit" disabled=${busy}>Find</button>
    </form>
    ${res && msg[res.status] && html`<p class="note tone-lavender" role="status"><${Icon} name="info" size=${18} /> ${msg[res.status]}</p>`}
    ${res?.status === 'error' && html`<p class="note tone-peach" role="alert">${res.error}</p>`}
    ${res?.user && html`<div class="friend-found">
      <${Avatar} avatar=${res.user.avatar} size=${48} /><span class="grow"><strong>${res.user.nickname}</strong><span class="muted small block">@${res.user.username} · <${DemoTag}>Simulated<//></span></span>
      ${res.status === 'found' && html`<button class="btn btn-primary btn-sm" style="flex:none" disabled=${busy} onClick=${() => act(() => sendRequest({ username: res.user.username }), 'Request sent — they’ll reply soon')}>Send request</button>`}
      ${res.status === 'requested' && html`<span class="tag tag-pending">Request sent</span>`}
      ${res.status === 'friend' && html`<span class="tag tag-verified">Already friends</span>`}
      ${res.status === 'incoming' && html`<button class="btn btn-primary btn-sm" style="flex:none" disabled=${busy} onClick=${() => act(() => respondRequest({ id: res.requestId, accept: true }), 'You’re now friends')}>Accept their request</button>`}
    </div>`}
    <div class="stack-sm">
      <span class="strong small">Or share your invite</span>
      <div class="row gap"><input class="link-input" type="text" readonly value=${link} aria-label="Your invite link" onFocus=${(e) => e.target.select()} />
        <button class="btn btn-ghost btn-sm" style="flex:none" onClick=${copy}><${Icon} name="copy" size=${18} /> Copy</button></div>
    </div>
  </section>`;
}

function ManageSheet({ friend, onClose, onChanged }) {
  const [mode, setMode] = useState('menu'); // menu | remove | block | report | done
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const go = async (fn, text) => {
    setBusy(true);
    try { await fn(); setDone(text); setMode('done'); onChanged(); } catch (e) { toast(e.message, 'peach'); } finally { setBusy(false); }
  };
  return html`<${Sheet} open=${true} onClose=${onClose} title=${mode === 'report' ? 'Report this profile' : friend.nickname}>
    <div class="stack">
      ${mode === 'menu' && html`<div class="row gap center"><${Avatar} avatar=${friend.avatar} size=${56} /><div><strong>${friend.nickname}</strong><p class="muted small">@${friend.username} · <${DemoTag}>Simulated<//></p></div></div>
        <button class="btn btn-ghost btn-block" onClick=${() => setMode('remove')}>Remove friend</button>
        <button class="btn btn-ghost btn-block" onClick=${() => setMode('block')}>Block</button>
        <button class="btn btn-ghost btn-block" onClick=${() => setMode('report')}><${Icon} name="flag" size=${18} /> Report profile</button>`}
      ${mode === 'remove' && html`<p>Remove <strong>${friend.nickname}</strong> from your friends? You can add each other again later.</p>
        <div class="row gap"><button class="btn btn-ghost" onClick=${() => setMode('menu')}>Back</button><button class="btn btn-primary danger-fill" disabled=${busy} onClick=${() => go(() => removeFriend({ userId: friend.id }), `${friend.nickname} was removed.`)}>Remove</button></div>`}
      ${mode === 'block' && html`<p>Block <strong>${friend.nickname}</strong>? They’ll be removed from your friends and won’t be able to find you or send requests. They aren’t told.</p>
        <div class="row gap"><button class="btn btn-ghost" onClick=${() => setMode('menu')}>Back</button><button class="btn btn-primary danger-fill" disabled=${busy} onClick=${() => go(() => blockUser({ userId: friend.id }), `${friend.nickname} is blocked. You can undo this under “Blocked”.`)}>Block</button></div>`}
      ${mode === 'report' && html`<fieldset class="issue-list"><legend class="strong">What’s the problem?</legend>
          ${REPORT_REASONS.map((r) => html`<label class=${`issue-option ${reason === r ? 'selected' : ''}`}><input type="radio" name="reason" checked=${reason === r} onChange=${() => setReason(r)} /><span class="grow strong">${r}</span></label>`)}</fieldset>
        <p class="muted small">Reports go to moderators (demo: stored on this device). You can also block this person.</p>
        <div class="row gap"><button class="btn btn-ghost" onClick=${() => setMode('menu')}>Back</button><button class="btn btn-primary" disabled=${busy} onClick=${() => go(() => reportUser({ userId: friend.id, reason }), 'Thanks for letting us know. A moderator will take a look.')}>Send report</button></div>`}
      ${mode === 'done' && html`<div class="success-pop"><p>${done}</p><button class="btn btn-primary" onClick=${onClose}>Done</button></div>`}
    </div>
  <//>`;
}

function MyStreak() {
  const st = useMyStreaks();
  const badges = useStore().social.badges;
  return html`<section class="card streak-card tone-mint stack-sm">
    <div class="streak-main">
      <div class=${`streak-bubble ${st.current > 0 ? 'on' : ''}`} aria-hidden="true"><strong>${st.current}</strong><span class="small">week${st.current === 1 ? '' : 's'}</span></div>
      <div class="stack-sm">
        <h2>Your streak</h2>
        <p class="small">Longest: <strong>${st.longest}</strong> · <span class=${`tag ${st.thisDone ? 'tag-verified' : 'tag-pending'}`}>${st.thisDone ? 'This week done' : 'This week open'}</span></p>
      </div>
    </div>
    <p aria-live="polite">${streakMessage(st)}</p>
    ${badges.length > 0 && html`<div class="chip-wrap">${badges.map((b) => html`<span class="chip tone-lavender">${b.name}</span>`)}</div>`}
  </section>`;
}

function FriendsTab({ data, me, refresh, addParam }) {
  const [manage, setManage] = useState(null);
  const run = async (fn, okMsg) => { try { const r = await fn(); if (r.ok === false) toast(r.error, 'peach'); else if (okMsg) toast(okMsg); refresh(); } catch (e) { toast(e.message, 'peach'); } };
  return html`<div class="stack">
    <${MyStreak} />
    ${data.incoming.length > 0 && html`<section class="card stack-sm"><h3>Friend requests <span class="tag tag-pending">${data.incoming.length}</span></h3>
      ${data.incoming.map((r) => html`<div class="friend-found" key=${r.id}><${Avatar} avatar=${r.user.avatar} size=${44} />
        <span class="grow"><strong>${r.user.nickname}</strong><span class="muted small block">@${r.user.username} · <${DemoTag}>Simulated<//></span></span>
        <button class="btn btn-primary btn-sm" style="flex:none" onClick=${() => run(() => respondRequest({ id: r.id, accept: true }), `You and ${r.user.nickname} are now friends`)}>Accept</button>
        <button class="btn btn-ghost btn-sm" style="flex:none" onClick=${() => run(() => respondRequest({ id: r.id, accept: false }), 'Request declined')}>Decline</button></div>`)}</section>`}

    <${AddFriend} me=${me} initial=${addParam} onChanged=${refresh} />

    ${data.outgoing.length > 0 && html`<section class="card stack-sm"><h3>Waiting for a reply</h3>
      ${data.outgoing.map((o) => html`<div class="friend-found" key=${o.id}><${Avatar} avatar=${o.user.avatar} size=${40} />
        <span class="grow"><strong>${o.user.nickname}</strong><span class="muted small block">Request sent · simulated reply in a few seconds</span></span>
        <button class="btn btn-ghost btn-sm" style="flex:none" onClick=${() => run(() => cancelRequest({ id: o.id }), 'Request cancelled')}>Cancel</button></div>`)}</section>`}

    <section class="section"><h2>Friends${data.friends.length > 0 ? ` (${data.friends.length})` : ''}</h2>
      ${data.friends.length === 0 && html`<p class="muted">No friends yet. Add someone by their exact username or an invite link. In this demo, try <strong>@minty_marta</strong> or <strong>@alu_andri</strong>.</p>`}
      <div class="list">
      ${data.friends.map((f) => html`<div class="list-row" key=${f.id}>
        <${Avatar} avatar=${f.avatar} size=${44} />
        <div class="grow">
          <span class="row-title block">${f.nickname} <span class="muted small">@${f.username}</span> <${DemoTag}>Simulated<//></span>
          <span class="row-sub block">${f.stats.weekItems !== null ? `${f.stats.weekItems} items this week` : 'Totals private'} · ${f.stats.streak !== null ? `streak ${f.stats.streak} week${f.stats.streak === 1 ? '' : 's'} (best ${f.stats.longest})` : 'streak private'}</span>
        </div>
        <button class="icon-btn" aria-label=${`Manage ${f.nickname}: remove, block or report`} onClick=${() => setManage(f)}><${Icon} name="settings" size=${20} /></button>
      </div>`)}
      </div>
    </section>

    ${data.blocked.length > 0 && html`<details class="card"><summary><strong>Blocked (${data.blocked.length})</strong></summary>
      <div class="stack-sm" style="margin-top:12px">${data.blocked.map((b) => html`<div class="friend-found" key=${b.id}><${Avatar} avatar=${b.avatar} size=${36} /><span class="grow"><strong>${b.nickname}</strong></span>
        <button class="btn btn-ghost btn-sm" style="flex:none" onClick=${() => run(() => unblockUser({ userId: b.id }), 'Unblocked')}>Unblock</button></div>`)}</div></details>`}

    ${manage && html`<${ManageSheet} friend=${manage} onClose=${() => setManage(null)} onChanged=${refresh} />`}
  </div>`;
}

// ---- Shell -------------------------------------------------------------------------

export default function Social({ params }) {
  const s = useStore();
  const soc = s.social;
  const [tab, setTab] = useState(params.get('tab') || 'friends');
  const [editing, setEditing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { status, data, error, refresh, retry } = useSocialData();
  const off = clockOffset();

  if (!soc.enabled) return html`<div class="screen social-screen"><${Header} title="Social" subtitle="Friends and challenges" /><${Onboarding} /></div>`;

  const me = { username: soc.username, nickname: soc.nickname };
  return html`<div class="screen social-screen">
    <${Header} title="Social" subtitle="Friends and challenges"
      right=${html`<button class="icon-btn" aria-label="Social settings and privacy" onClick=${() => setEditing(true)}><${Icon} name="settings" size=${22} /></button>`} />
    ${off > 0 && html`<p class="note tone-peach small"><${Icon} name="clock" size=${18} /> Demo clock is ${Math.round(off / 86400000)} days ahead (Profile › Developer).</p>`}
    <${Segmented} label="Social sections" value=${tab} onChange=${setTab} options=${[{ value: 'friends', label: 'Friends', icon: 'users' }, { value: 'challenges', label: 'Challenges', icon: 'trophy' }]} />
    <p class="note tone-sky small"><${Icon} name="info" size=${18} /> <span><strong>Demo:</strong> other people here are simulated and respond after a few seconds. Real friends need accounts and a server.</span></p>

    ${status === 'loading' && !data && html`<${Skeleton} lines=${3} /><${Skeleton} lines=${3} />`}
    ${status === 'error' && !data && html`<${StateCard} icon="alert" tone="peach" title="Couldn’t load Social" action=${html`<button class="btn btn-primary btn-sm" onClick=${retry}><${Icon} name="refresh" size=${18} /> Try again</button>`}>${error}<//>`}
    ${status === 'error' && data && html`<p class="note tone-peach small" role="alert"><${Icon} name="alert" size=${18} /> Couldn’t refresh just now (${error}). Showing what we had.</p>`}

    ${data && tab === 'friends' && html`<${FriendsTab} data=${data} me=${me} refresh=${refresh} addParam=${params.get('add') || ''} />`}
    ${data && tab === 'challenges' && html`<${ChallengesTab} data=${data} refresh=${refresh} />`}

    ${editing && html`<${Sheet} open=${true} onClose=${() => setEditing(false)} title="Social settings">
      <section class="card-inset stack-sm">
        <${Toggle} checked=${soc.reminders.on} onChange=${(v) => updateReminders({ on: v })} label="Remind me if my week is still open" description="A quiet note on the home screen. Off by default." />
      </section>
      <${SetupForm} initial=${soc} submitLabel="Save" onCancel=${() => setEditing(false)} onSave=${(v) => { updateSocial({ nickname: v.nickname, username: v.username, avatar: v.avatar }); updateSocialPrivacy(v.privacy); setEditing(false); toast('Saved'); }} onLeave=${() => { setEditing(false); setConfirmLeave(true); }} /><//>`}
    ${confirmLeave && html`<${Sheet} open=${true} onClose=${() => setConfirmLeave(false)} title="Leave Social?">
      <div class="stack"><p>Your social profile and sharing choices will be removed from this device. Your recycling activity, points and rewards stay exactly as they are.</p>
        <div class="row gap"><button class="btn btn-ghost" onClick=${() => setConfirmLeave(false)}>Keep it</button><button class="btn btn-primary danger-fill" onClick=${() => { leaveSocial(); setConfirmLeave(false); toast('You’ve left Social', 'peach'); }}>Leave Social</button></div></div><//>`}
  </div>`;
}
