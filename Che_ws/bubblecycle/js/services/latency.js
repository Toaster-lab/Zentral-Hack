import { config } from '../config.js';
import { sleep } from '../utils.js';
import { devFlags } from './flags.js';

// Simulated network latency / failures for the demo providers.
export async function simulate() {
  const [min, max] = config.demoLatencyMs;
  await sleep(min + Math.random() * (max - min));
  if (devFlags.simulateErrors) throw new Error('Simulated network error (turn off in Profile › Developer).');
}
