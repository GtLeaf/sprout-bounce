const SESSION_STORAGE_KEY = 'happy-jump-cloud-session-v1';

export function sanitizeDisplayName(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
}

export function normalizeLeaderboardEntry(row) {
  const profile = Array.isArray(row?.profiles) ? row.profiles[0] : row?.profiles;
  return {
    userId: String(row?.user_id ?? ''),
    displayName: sanitizeDisplayName(profile?.display_name) || '神秘玩家',
    score: Math.max(0, Math.floor(Number(row?.best_score) || 0)),
    level: Math.max(1, Math.floor(Number(row?.best_level) || 1)),
    won: Boolean(row?.won),
    gamesPlayed: Math.max(0, Math.floor(Number(row?.games_played) || 0)),
    updatedAt: row?.updated_at || null
  };
}

function normalizeConfig(config = {}) {
  return {
    url: String(config.supabaseUrl || '').replace(/\/+$/, ''),
    anonKey: String(config.supabaseAnonKey || '').trim()
  };
}

function messageFromPayload(payload, fallback) {
  return payload?.msg || payload?.message || payload?.error_description || payload?.error || fallback;
}

export class CloudLeaderboardService {
  constructor(config, { fetchFn = globalThis.fetch, storage = globalThis.localStorage } = {}) {
    const normalized = normalizeConfig(config);
    this.url = normalized.url;
    this.anonKey = normalized.anonKey;
    this.fetch = fetchFn;
    this.storage = storage;
    this.session = null;
    this.profile = null;
    this.listeners = new Set();
  }

  get enabled() {
    return Boolean(this.url && this.anonKey && this.fetch);
  }

  get user() {
    return this.session?.user || null;
  }

  get displayName() {
    return sanitizeDisplayName(this.profile?.display_name || this.user?.user_metadata?.display_name) || null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    const snapshot = { enabled: this.enabled, user: this.user, profile: this.profile, displayName: this.displayName };
    for (const listener of this.listeners) listener(snapshot);
  }

  authHeaders(accessToken = this.session?.access_token) {
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${accessToken || this.anonKey}`,
      'Content-Type': 'application/json'
    };
  }

  async request(path, { method = 'GET', body, accessToken, headers = {} } = {}) {
    if (!this.enabled) throw new Error('云端排行榜尚未配置');
    const response = await this.fetch(`${this.url}${path}`, {
      method,
      headers: { ...this.authHeaders(accessToken), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const contentType = response.headers?.get?.('content-type') || '';
    const payload = contentType.includes('json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error(messageFromPayload(payload, `请求失败 (${response.status})`));
    return payload;
  }

  persistSession(session) {
    this.session = session?.access_token ? session : null;
    try {
      if (this.session) this.storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.session));
      else this.storage?.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Login still works for this tab if browser storage is unavailable.
    }
  }

  readStoredSession() {
    try {
      const value = JSON.parse(this.storage?.getItem(SESSION_STORAGE_KEY) || 'null');
      return value?.access_token && value?.refresh_token ? value : null;
    } catch {
      return null;
    }
  }

  async restoreSession() {
    if (!this.enabled) {
      this.emit();
      return null;
    }
    const stored = this.readStoredSession();
    if (!stored) {
      this.emit();
      return null;
    }
    this.persistSession(stored);
    try {
      const expiresAt = Number(stored.expires_at || 0) * 1000;
      if (!expiresAt || expiresAt <= Date.now() + 60_000) await this.refreshSession();
      else await this.loadProfile();
      this.emit();
      return this.session;
    } catch {
      this.persistSession(null);
      this.profile = null;
      this.emit();
      return null;
    }
  }

  async refreshSession() {
    if (!this.session?.refresh_token) throw new Error('登录已失效，请重新登录');
    const session = await this.request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      accessToken: this.anonKey,
      body: { refresh_token: this.session.refresh_token }
    });
    this.persistSession(session);
    await this.loadProfile();
    return session;
  }

  async signUp({ email, password, displayName }) {
    const name = sanitizeDisplayName(displayName);
    if (name.length < 2) throw new Error('昵称至少需要 2 个字符');
    const payload = await this.request('/auth/v1/signup', {
      method: 'POST',
      accessToken: this.anonKey,
      body: { email: String(email).trim(), password, data: { display_name: name } }
    });
    if (payload?.access_token) {
      this.persistSession(payload);
      await this.loadProfile();
      this.emit();
    }
    return payload;
  }

  async signIn({ email, password }) {
    const session = await this.request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      accessToken: this.anonKey,
      body: { email: String(email).trim(), password }
    });
    this.persistSession(session);
    await this.loadProfile();
    this.emit();
    return session;
  }

  async signOut() {
    const accessToken = this.session?.access_token;
    try {
      if (accessToken) await this.request('/auth/v1/logout', { method: 'POST', accessToken });
    } catch {
      // A local logout must still succeed if the network is unavailable.
    } finally {
      this.persistSession(null);
      this.profile = null;
      this.emit();
    }
  }

  async loadProfile() {
    if (!this.user?.id) return null;
    const rows = await this.request(`/rest/v1/profiles?select=user_id,display_name&user_id=eq.${encodeURIComponent(this.user.id)}&limit=1`);
    this.profile = Array.isArray(rows) ? rows[0] || null : null;
    return this.profile;
  }

  async getLeaderboard(limit = 10) {
    const count = Math.max(1, Math.min(50, Math.floor(limit)));
    const rows = await this.request(`/rest/v1/leaderboard_entries?select=user_id,best_score,best_level,won,games_played,updated_at,profiles(display_name)&order=best_score.desc,best_level.desc,updated_at.asc&limit=${count}`);
    return (Array.isArray(rows) ? rows : []).map(normalizeLeaderboardEntry);
  }

  async getMyBest() {
    if (!this.user?.id) return null;
    const rows = await this.request(`/rest/v1/leaderboard_entries?select=user_id,best_score,best_level,won,games_played,updated_at,profiles(display_name)&user_id=eq.${encodeURIComponent(this.user.id)}&limit=1`);
    return rows?.[0] ? normalizeLeaderboardEntry(rows[0]) : null;
  }

  async submitScore({ score, level, won }) {
    if (!this.user) throw new Error('请先登录再上传成绩');
    const rows = await this.request('/rest/v1/rpc/submit_score', {
      method: 'POST',
      body: {
        p_score: Math.max(0, Math.floor(Number(score) || 0)),
        p_level: Math.max(1, Math.floor(Number(level) || 1)),
        p_won: Boolean(won)
      }
    });
    return rows?.[0] ? normalizeLeaderboardEntry({ ...rows[0], profiles: { display_name: this.displayName } }) : null;
  }
}

export function createCloudLeaderboard(config = globalThis.HAPPY_JUMP_CLOUD) {
  return new CloudLeaderboardService(config);
}
