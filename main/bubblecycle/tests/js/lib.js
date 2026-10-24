// A tiny test runner for the browser (the project needs no Node). Tests register with test(name, fn); run() runs
// them all and returns the results. tests/run_js.py opens tests/js/index.html headlessly and fails on any failure.
const tests = [];
export const test = (name, fn) => tests.push({ name, fn });

export function assert(cond, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
export function equal(actual, expected, msg = '') {
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? `${msg}: ` : ''}expected ${e} but got ${a}`);
}

export async function run() {
  const results = [];
  for (const t of tests) {
    try { await t.fn(); results.push({ name: t.name, ok: true }); } catch (e) { results.push({ name: t.name, ok: false, error: String(e.message || e) }); }
  }
  return results;
}
