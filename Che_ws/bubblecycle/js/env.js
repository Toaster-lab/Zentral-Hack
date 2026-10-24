// Where this copy of the app gets its rules from. Static hosting and `python serve.py` use this file as is:
// everything runs on the device (demo). The RECYCL IT! server (`python -m server`) answers /js/env.js itself
// with { api: true, mode: 'demo' | 'live' }, which switches logging, points, rewards and rankings to the server.
export const env = { api: false, mode: 'local' };
