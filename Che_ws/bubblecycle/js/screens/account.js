// Account for the server version: a passkey on this device. Shown only when someone needs an account
// (to log, redeem or see their points), never as a wall at startup.
import { html, useEffect, useState } from '../lib.js';
import { Icon, Sheet, DemoTag, toast } from '../ui.js';
import { env } from '../env.js';
import { useAccount, getAccount, registerWithPasskey, signInWithPasskey, demoSignIn, signOut, deleteAccount, passkeysPossible, friendlyAuthError, saveServerProfile } from '../services/account.js';
import { syncFromServer } from '../services/activity.js';

let opener = null;

// Resolves true once signed in (or already), false if the person closes the sheet.
export function requireSignIn() {
  if (!env.api || getAccount().status === 'signedIn') return Promise.resolve(true);
  return new Promise((resolve) => { if (opener) opener(resolve); else resolve(false); });
}

export function SignInHost() {
  const account = useAccount();
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [possible, setPossible] = useState(true);

  useEffect(() => {
    opener = (resolve) => { setDone(() => resolve); setError(''); setBusy(false); passkeysPossible().then(setPossible); };
    return () => { opener = null; };
  }, []);

  if (!done) return null;
  const close = (ok) => { done(ok); setDone(null); };

  async function run(fn) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await fn();
      await syncFromServer().catch(() => {});
      close(true);
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  const server = account.server;
  return html`<${Sheet} open=${true} onClose=${() => close(false)} dismissable=${!busy} title="Your account">
    <div class="stack">
      <p>Your recycling and points are kept on the RECYCL IT! server, so they can’t be edited on a phone. An account is a passkey on your device: no email, no password.</p>
      <p class="small muted">A passkey is unlocked with your face, fingerprint or device passcode. RECYCL IT! never sees those; it only gets a yes or no.</p>
      ${!possible && html`<p class="note tone-peach" role="alert"><${Icon} name="alert" size=${18} /> <span>Passkeys need a secure connection (https) and a browser that supports them.</span></p>`}
      ${error && html`<p class="note tone-peach" role="alert"><${Icon} name="alert" size=${18} /> <span>${error}</span></p>`}
      <button class="btn btn-primary btn-block" disabled=${busy || !possible || server?.passkeys === false} onClick=${() => run(() => registerWithPasskey())}>
        <${Icon} name="shield" size=${18} /> ${busy ? 'Waiting for your device…' : 'Create an account with a passkey'}
      </button>
      <button class="btn btn-ghost btn-block" disabled=${busy || !possible || server?.passkeys === false} onClick=${() => run(() => signInWithPasskey())}>I already have an account</button>
      ${server?.passkeys === false && html`<p class="small muted">This server can’t verify passkeys yet (the “cryptography” package is missing).</p>`}
      ${server?.demoSignIn && html`<div class="card-inset stack-sm">
        <p class="small"><${DemoTag}>Demo server only<//> Try the demo without a passkey. The confirmation step is then simulated and checks nothing about who you are.</p>
        <button class="btn btn-ghost btn-sm" disabled=${busy} onClick=${() => run(() => demoSignIn())}>Continue with a demo account</button>
      </div>`}
    </div>
  <//>`;
}

// Account block for Profile.
export function AccountSection() {
  const account = useAccount();
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  useEffect(() => { setNick(account.user?.nickname || ''); }, [account.user?.nickname]);
  if (!env.api) return null;

  if (account.status !== 'signedIn') {
    return html`<section class="card stack">
      <h2>Account</h2>
      <p class="small">${account.status === 'offline' ? 'You’re offline, so your account can’t be checked right now.' : 'You’re not signed in. Your points and activity are kept on the server once you are.'}</p>
      <button class="btn btn-primary btn-sm" style="align-self:flex-start" onClick=${() => requireSignIn()}>Sign in or create an account</button>
    </section>`;
  }
  const u = account.user;
  async function save(patch) {
    setBusy(true);
    try { await saveServerProfile(patch); toast('Saved'); } catch (e) { toast(friendlyAuthError(e), 'peach'); } finally { setBusy(false); }
  }
  return html`<section class="card stack">
    <h2>Account ${u.isDemo && html`<${DemoTag}>Demo account<//>`}</h2>
    <p class="small muted">Your account is just a random ID on the server. No email, no real name.</p>
    <form class="field" onSubmit=${(e) => { e.preventDefault(); save({ nickname: nick.trim() }); }}>
      <label for="srv-nick" class="strong">Nickname <span class="muted">(only shown if you join the leaderboard)</span></label>
      <div class="row gap">
        <input id="srv-nick" type="text" maxlength="20" value=${nick} onInput=${(e) => setNick(e.target.value)} />
        <button class="btn btn-primary btn-sm" type="submit" disabled=${busy || nick.trim() === (u.nickname || '')}>Save</button>
      </div>
    </form>
    <div class="row gap wrap">
      <button class="btn btn-ghost btn-sm" onClick=${async () => { await signOut(); toast('Signed out'); }}>Sign out</button>
      <button class="btn btn-ghost btn-sm danger" onClick=${() => setAskDelete(true)}><${Icon} name="trash" size=${18} /> Delete my account</button>
    </div>
    <${Sheet} open=${askDelete} onClose=${() => setAskDelete(false)} dismissable=${!busy} title="Delete your account?">
      <div class="stack">
        <p>This deletes your account, points, rewards, activity and any check-ins held for review from the server. It can’t be undone. Receipt codes you used stay used.</p>
        <div class="row gap">
          <button class="btn btn-ghost" disabled=${busy} onClick=${() => setAskDelete(false)}>Cancel</button>
          <button class="btn btn-primary danger-fill" disabled=${busy} onClick=${async () => {
            setBusy(true);
            try { await deleteAccount(); setAskDelete(false); toast('Account deleted', 'peach'); } catch (e) { toast(friendlyAuthError(e), 'peach'); } finally { setBusy(false); }
          }}>Delete everything</button>
        </div>
      </div>
    <//>
  </section>`;
}
