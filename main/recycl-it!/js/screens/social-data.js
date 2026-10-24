// Loads the social state, keeps it fresh (simulated friends reply after a few seconds),
// and finalises challenges that have ended (frozen results + digital badge).
import { useEffect, useRef, useState } from '../lib.js';
import { getSocial, saveChallengeResult } from '../services/index.js';
import { getState, addBadge, useStore } from '../store.js';
import { challengeRows } from '../logic/social.js';
import { toast } from '../ui.js';

async function finaliseEnded(data) {
  const { activities, social } = getState();
  for (const ch of data.challenges) {
    if (ch.status !== 'ended' || ch.result) continue;
    const ranking = challengeRows(ch, activities, data.now, social.nickname).map((r) => ({ ...r }));
    ch.result = { ranking, finalizedAt: data.now };
    await saveChallengeResult({ id: ch.id, result: ch.result });
    const mine = ranking.find((r) => r.isMe);
    // A badge needs at least one eligible item: nobody gets one just for being signed up.
    if (mine && mine.score > 0) {
      const winner = mine.rank === 1;
      const made = addBadge({ id: `badge-${ch.id}`, challengeId: ch.id, name: winner ? 'Challenge winner' : 'Challenge finisher', kind: winner ? 'winner' : 'participant', ts: data.now });
      if (made) toast(winner ? 'A challenge ended and you came first. Badge added.' : 'A challenge ended. Badge added.');
    }
  }
}

export function useSocialData() {
  const s = useStore();
  const nick = useRef('');
  nick.current = s.social.nickname;
  const av = useRef(null);
  av.current = { ...s.social.avatar, initial: (s.social.nickname || '?').slice(0, 1).toUpperCase() };
  const [st, setSt] = useState({ status: 'loading', data: null, error: '' });

  const load = async () => {
    try {
      const data = await getSocial({ myName: nick.current, myAvatar: av.current });
      await finaliseEnded(data);
      setSt({ status: 'ready', data, error: '' });
    } catch (e) {
      setSt((p) => ({ status: 'error', data: p.data, error: e.message || 'Something went wrong.' }));
    }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, []);
  return { ...st, refresh: load, retry: () => { setSt((p) => ({ ...p, status: 'loading' })); load(); } };
}
