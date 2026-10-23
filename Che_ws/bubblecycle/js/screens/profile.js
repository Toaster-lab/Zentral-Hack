import { html, useEffect, useState } from '../lib.js';
import { Header, Icon, Toggle, Avatar, Sheet, toast } from '../ui.js';
import { useStore, updateProfile, resetAll, getBalance } from '../store.js';
import { MUNICIPALITIES } from '../logic/rules.js';
import { REWARDS } from '../data/misc.js';
import { devFlags, resetSocialDemo } from '../services/index.js';
import { clockOffset, setClockOffset } from '../logic/clock.js';
import { navigate } from '../router.js';

const NICK_RE = /^[\p{L}\p{N}_ .-]{3,20}$/u;

function nicknameError(n) {
  if (!n) return '';
  if (!NICK_RE.test(n)) return '3–20 letters, numbers, spaces, dots, dashes or underscores.';
  if (/@|\d{6,}/.test(n)) return 'Please don’t use an email address or phone number.';
  return '';
}

export default function Profile() {
  const s = useStore();
  const p = s.profile;
  const [nick, setNick] = useState(p.nickname);
  const [confirmReset, setConfirmReset] = useState(false);
  const [canInstall, setCanInstall] = useState(!!window.__installPrompt);
  useEffect(() => {
    const on = () => setCanInstall(!!window.__installPrompt);
    window.addEventListener('bc-installable', on);
    return () => window.removeEventListener('bc-installable', on);
  }, []);
  async function install() {
    const e = window.__installPrompt;
    if (!e) return;
    e.prompt();
    await e.userChoice;
    window.__installPrompt = null;
    setCanInstall(false);
  }
  const [simErrors, setSimErrors] = useState(devFlags.simulateErrors);
  const nickErr = nicknameError(nick.trim());
  const badges = s.redemptions.map((r) => REWARDS.find((x) => x.id === r.rewardId)).filter((r) => r?.kind === 'badge');

  function saveNick(e) {
    e.preventDefault();
    if (nickErr) return;
    const n = nick.trim();
    updateProfile({ nickname: n, leaderboardOptIn: n ? p.leaderboardOptIn : false });
    toast(n ? 'Nickname saved' : 'Nickname removed');
  }

  return html`<div class="screen profile-screen">
    <section class="profile-head">
      <${Avatar} avatar=${{ ...s.social.avatar, initial: (p.nickname || s.social.nickname || '?').slice(0, 1).toUpperCase() }} size=${64} />
      <div>
        <h1>${p.nickname || 'Your profile'}</h1>
        <p class="muted">${getBalance()} points${badges.length ? ` · ${badges.map((b) => b.name).join(', ')}` : ''}</p>
      </div>
    </section>

    <nav class="link-list" aria-label="Your stuff">
      <button onClick=${() => navigate('social')}><${Icon} name="users" /> Social <span class="muted small">${s.social.enabled ? `@${s.social.username}` : 'optional'}</span> <${Icon} name="chevron" size=${18} /></button>
      <button onClick=${() => navigate('quests')}><${Icon} name="star" /> Monthly quests <${Icon} name="chevron" size=${18} /></button>
      <button onClick=${() => navigate('collection')}><${Icon} name="leaf" /> Bottledex <${Icon} name="chevron" size=${18} /></button>
      <button onClick=${() => navigate('rewards')}><${Icon} name="gift" /> Rewards <${Icon} name="chevron" size=${18} /></button>
      <button onClick=${() => navigate('leaderboard')}><${Icon} name="trophy" /> Leaderboard <${Icon} name="chevron" size=${18} /></button>
      <button onClick=${() => navigate('activity')}><${Icon} name="clock" /> Activity history <${Icon} name="chevron" size=${18} /></button>
      <button onClick=${() => navigate('contributions')}><${Icon} name="pin" /> My contributions <${Icon} name="chevron" size=${18} /></button>
      <button onClick=${() => navigate('admin')}><${Icon} name="shield" /> Admin review <span class="tag tag-demo">Demo</span> <${Icon} name="chevron" size=${18} /></button>
    </nav>

    <section class="card stack">
      <h2>About you</h2>
      <form onSubmit=${saveNick} class="field">
        <label for="nick" class="strong">Nickname <span class="muted">(optional, shown on the leaderboard)</span></label>
        <div class="row gap">
          <input id="nick" type="text" maxlength="20" value=${nick} onInput=${(e) => setNick(e.target.value)} placeholder="e.g. BubbleFan" aria-invalid=${nickErr ? 'true' : 'false'} />
          <button class="btn btn-primary btn-sm" type="submit" disabled=${!!nickErr || nick.trim() === p.nickname}>Save</button>
        </div>
        ${nickErr && html`<span class="note tone-peach small" role="alert">${nickErr}</span>`}
        <span class="muted small">Don’t use your real name.</span>
      </form>
      <label class="field">
        <span class="strong">Municipality <span class="muted">(for recycling rules)</span></span>
        <select value=${p.municipality} onChange=${(e) => updateProfile({ municipality: e.target.value })}>
          ${Object.entries(MUNICIPALITIES).map(([k, v]) => html`<option value=${k}>${v.name}</option>`)}
        </select>
      </label>
      <label class="field">
        <span class="strong">Weekly goal: ${p.weeklyGoal} items</span>
        <input type="range" min="5" max="60" step="5" value=${p.weeklyGoal} onInput=${(e) => updateProfile({ weeklyGoal: Number(e.target.value) })} />
      </label>
    </section>

    <section class="card stack">
      <h2>Leaderboard</h2>
      <${Toggle} checked=${p.leaderboardOptIn} disabled=${!p.nickname}
        onChange=${(v) => updateProfile({ leaderboardOptIn: v })}
        label="Show me on the leaderboard"
        description=${p.nickname ? 'Shows your nickname and item counts. Off by default.' : 'Save a nickname first.'} />
    </section>

    <section class="card stack">
      <h2>Data sources</h2>
      <${Toggle} checked=${p.useOpenFoodFacts} onChange=${(v) => updateProfile({ useOpenFoodFacts: v })}
        label="Look up unknown barcodes on Open Food Facts"
        description="Sends only the barcode number to openfoodfacts.org (community data). Off by default." />
    </section>

    ${canInstall && html`<section class="section">
      <h2>Install</h2>
      <p class="muted">Add BubbleCycle to your home screen or desktop. It opens in its own window and works offline (the map needs a connection for its tiles).</p>
      <button class="btn btn-primary" style="align-self:flex-start" onClick=${install}>Install BubbleCycle</button>
    </section>`}

    <section class="card stack">
      <h2>Privacy</h2>
      <p class="small">Everything stays on this device (browser storage): your nickname, municipality, recycling logs, points and rewards. No account, no email, no tracking. Your location is used only to find nearby places and is not stored, except a coarse area. Places and photos you submit contain no information about you; they’re tied only to a random ID on this device so you can follow their status.</p>
      <button class="btn btn-ghost btn-sm danger" onClick=${() => setConfirmReset(true)}><${Icon} name="trash" size=${18} /> Delete all my data</button>
    </section>

    <details class="card">
      <summary><strong>Developer</strong></summary>
      <div class="stack" style="margin-top:12px">
        <${Toggle} checked=${simErrors} onChange=${(v) => { devFlags.simulateErrors = v; setSimErrors(v); }}
          label="Simulate network errors" description="Demo services fail, so you can see the error states. Resets on reload." />
        <div class="stack-sm">
          <strong>Demo clock</strong>
          <p class="muted small">Jump ahead to see challenges finish and streaks end. ${clockOffset() ? `Currently ${Math.round(clockOffset() / 86400000)} days ahead.` : 'Currently real time.'}</p>
          <div class="row gap"><button class="btn btn-ghost btn-sm" onClick=${() => { setClockOffset(clockOffset() + 7 * 86400000); location.reload(); }}>+1 week</button><button class="btn btn-ghost btn-sm" onClick=${() => { setClockOffset(0); location.reload(); }}>Reset clock</button></div>
          <button class="btn btn-ghost btn-sm" onClick=${async () => { await resetSocialDemo(); toast('Simulated friends and challenges reset'); }}>Reset simulated friends & challenges</button>
        </div>
      </div>
    </details>

    <${Sheet} open=${confirmReset} onClose=${() => setConfirmReset(false)} title="Delete all data?">
      <div class="stack">
        <p>This removes your nickname, logs, points and rewards from this device. It can’t be undone.</p>
        <div class="row gap">
          <button class="btn btn-ghost" onClick=${() => setConfirmReset(false)}>Cancel</button>
          <button class="btn btn-primary danger-fill" onClick=${() => { resetAll(); resetSocialDemo(); setNick(''); setConfirmReset(false); toast('All data deleted', 'peach'); }}>Delete everything</button>
        </div>
      </div>
    <//>
  </div>`;
}
