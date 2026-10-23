// The app's notion of "now". Normally the real time. The developer tool in Profile can
// jump it forward (whole days) so challenge endings and streak breaks can be tried
// without waiting. Only recycling/social logic uses it.
const KEY = 'bubblecycle:clock-offset';
let offset = 0;
try { offset = Number(localStorage.getItem(KEY)) || 0; } catch { /* ignore */ }

export const nowTs = () => Date.now() + offset;
export const clockOffset = () => offset;
export function setClockOffset(ms) {
  offset = ms;
  try { if (ms) localStorage.setItem(KEY, String(ms)); else localStorage.removeItem(KEY); } catch { /* ignore */ }
}
