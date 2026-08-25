import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CloudLeaderboardService, normalizeLeaderboardEntry, sanitizeDisplayName } from './leaderboard-service.mjs';

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => payload
  };
}

test('display names are safe, compact, and suitable for public ranking rows', () => {
  assert.equal(sanitizeDisplayName('  <b>芽\n芽</b>  '), '芽 芽');
  assert.equal(sanitizeDisplayName('x'.repeat(30)).length, 20);
});

test('leaderboard rows expose public profile data without email addresses', () => {
  const entry = normalizeLeaderboardEntry({
    user_id: 'player-1', best_score: 3456.9, best_level: 7, won: false, games_played: 4,
    profiles: { display_name: '果果' }
  });
  assert.deepEqual(entry, {
    userId: 'player-1', displayName: '果果', score: 3456, level: 7,
    won: false, gamesPlayed: 4, updatedAt: null
  });
  assert.equal('email' in entry, false);
});

test('login persists a refreshable session and uses the player token for profile reads', async () => {
  const calls = [];
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key)
  };
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/token?grant_type=password')) return jsonResponse({
      access_token: 'player-token', refresh_token: 'refresh-token', expires_at: 9999999999,
      user: { id: 'player-1', user_metadata: { display_name: '芽芽' } }
    });
    return jsonResponse([{ user_id: 'player-1', display_name: '芽芽' }]);
  };
  const service = new CloudLeaderboardService(
    { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'public-anon-key' },
    { fetchFn, storage }
  );
  await service.signIn({ email: 'player@example.com', password: 'password123' });
  assert.equal(service.displayName, '芽芽');
  assert.match(store.get('happy-jump-cloud-session-v1'), /player-token/);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer player-token');
});

test('score upload is bound to the logged-in token and normalized before submission', async () => {
  let rpcCall;
  const service = new CloudLeaderboardService(
    { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'public-anon-key' },
    { fetchFn: async (url, options) => {
      rpcCall = { url, options };
      return jsonResponse([{ user_id: 'player-1', best_score: 1200, best_level: 3, won: false, games_played: 2 }]);
    }, storage: null }
  );
  service.session = { access_token: 'player-token', user: { id: 'player-1' } };
  service.profile = { display_name: '果果' };
  const result = await service.submitScore({ score: 1200.8, level: 3.9, won: 0 });
  assert.match(rpcCall.url, /\/rest\/v1\/rpc\/submit_score$/);
  assert.equal(rpcCall.options.headers.Authorization, 'Bearer player-token');
  assert.deepEqual(JSON.parse(rpcCall.options.body), { p_score: 1200, p_level: 3, p_won: false });
  assert.equal(result.displayName, '果果');
});

test('a returning player restores the stored login and profile', async () => {
  const storedSession = {
    access_token: 'saved-token', refresh_token: 'saved-refresh', expires_at: 9999999999,
    user: { id: 'returning-player', email: 'returning@example.com' }
  };
  const service = new CloudLeaderboardService(
    { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'public-anon-key' },
    {
      storage: { getItem: () => JSON.stringify(storedSession), setItem() {}, removeItem() {} },
      fetchFn: async () => jsonResponse([{ user_id: 'returning-player', display_name: '回归玩家' }])
    }
  );
  await service.restoreSession();
  assert.equal(service.user.id, 'returning-player');
  assert.equal(service.displayName, '回归玩家');
});

test('local logout succeeds even when the cloud request is offline', async () => {
  let removed = false;
  const service = new CloudLeaderboardService(
    { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'public-anon-key' },
    {
      storage: { getItem: () => null, setItem() {}, removeItem: () => { removed = true; } },
      fetchFn: async () => { throw new Error('offline'); }
    }
  );
  service.session = { access_token: 'player-token', user: { id: 'player-1' } };
  await service.signOut();
  assert.equal(service.user, null);
  assert.equal(removed, true);
});

test('database migration allows public reads but only authenticated score submission', async () => {
  const sql = await readFile(new URL('./supabase/migrations/202608250001_cloud_leaderboard.sql', import.meta.url), 'utf8');
  assert.match(sql, /alter table public\.leaderboard_entries enable row level security/);
  assert.match(sql, /create policy "Leaderboard is readable"[\s\S]*?to anon, authenticated[\s\S]*?using \(true\)/);
  assert.match(sql, /player_id uuid := auth\.uid\(\)/);
  assert.match(sql, /revoke all on function public\.submit_score[\s\S]*?from public, anon/);
  assert.match(sql, /grant execute on function public\.submit_score[\s\S]*?to authenticated/);
});
