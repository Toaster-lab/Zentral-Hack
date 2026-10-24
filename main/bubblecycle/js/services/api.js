// Thin client for the RECYCL IT! server. Same origin only: the session lives in an HttpOnly cookie that
// JavaScript can't read, and nothing secret is ever shipped in the frontend.
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; }
}
export class NetworkError extends Error {
  constructor() { super('You’re offline or the server can’t be reached.'); this.name = 'NetworkError'; }
}

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`api/${path}`, {
      method, cache: 'no-store', credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new NetworkError(); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error?.code || 'error', data.error?.message || 'Something went wrong. Please try again.');
  return data;
}
