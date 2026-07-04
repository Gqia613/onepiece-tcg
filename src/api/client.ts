// バックエンド(/api/*)への薄いfetchラッパ。Cookie(セッション)は同一オリジンで自動付与。
export type ApiError = { error: string; status: number };

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err: ApiError = { error: (body && body.error) || res.statusText || 'error', status: res.status };
    throw err;
  }
  return body as T;
}

export type User = { id: string; username: string };
export type SavedDeck = { id: string; name: string; leader: string; list: Record<string, number>; updatedAt: number };

export const api = {
  me: () => req<{ user: User | null }>('/api/me'),
  register: (username: string, password: string, invite: string) =>
    req<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password, invite }) }),
  login: (username: string, password: string) =>
    req<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => req<{ ok: true }>('/api/logout', { method: 'POST' }),

  // ---- デッキのクラウド保存（Phase4） ----
  listDecks: () => req<{ decks: SavedDeck[] }>('/api/decks'),
  createDeck: (d: { name: string; leader: string; list: Record<string, number> }) =>
    req<{ deck: SavedDeck }>('/api/decks', { method: 'POST', body: JSON.stringify(d) }),
  deleteDeck: (id: string) =>
    req<{ ok: true }>('/api/decks/' + encodeURIComponent(id), { method: 'DELETE' }),
};
