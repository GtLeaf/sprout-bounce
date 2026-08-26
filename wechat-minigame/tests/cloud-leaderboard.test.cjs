const test = require('node:test');
const assert = require('node:assert/strict');
const { PENDING_SCORE_KEY, WechatLeaderboard } = require('../src/cloud-leaderboard');

function createWxMock(results) {
  const storage = new Map();
  const calls = [];
  const queue = results.slice();
  const wxMock = {
    login(options) { options.success({ code: 'temporary-code' }); },
    getStorageSync(key) { return storage.get(key); },
    setStorageSync(key, value) { storage.set(key, value); },
    removeStorageSync(key) { storage.delete(key); },
    cloud: {
      init(options) { calls.push({ init: options }); },
      CloudID(id) { return { cloudID: id }; },
      callFunction(options) {
        calls.push(options.data);
        const next = queue.shift();
        if (next instanceof Error) options.fail(next);
        else options.success({ result: next });
      }
    }
  };
  return { calls, storage, wxMock };
}

test('login restores the returning WeChat player and ranking data', async () => {
  const response = {
    ok: true,
    player: { displayName: '老玩家', bestScore: 880, bestLevel: 4, gamesPlayed: 6 },
    entries: [{ displayName: '老玩家', bestScore: 880 }],
    myRank: 3
  };
  const { calls, wxMock } = createWxMock([response]);
  const service = new WechatLeaderboard(wxMock, { cloudEnvId: 'env-a', cloudFunctionName: 'leaderboard' });
  await service.initialize();
  assert.equal(service.player.bestScore, 880);
  assert.equal(service.rank, 3);
  assert.deepEqual(calls[1], { action: 'login' });
});

test('an unconfigured test AppID stays local without calling WeChat cloud APIs', async () => {
  const { calls, wxMock } = createWxMock([]);
  const service = new WechatLeaderboard(wxMock, { cloudEnvId: '', cloudFunctionName: 'leaderboard' });
  await assert.rejects(() => service.initialize(), /云环境尚未配置/);
  assert.deepEqual(calls, []);
  assert.equal(service.ready, false);
});

test('authorized profile is sent as a CloudID instead of client-provided profile text', async () => {
  const response = { ok: true, player: { displayName: '微信昵称' }, entries: [], myRank: null };
  const { calls, wxMock } = createWxMock([response]);
  const service = new WechatLeaderboard(wxMock, { cloudFunctionName: 'leaderboard' });
  await service.updateAuthorizedProfile('verified-cloud-id');
  assert.deepEqual(calls[0], {
    action: 'updateProfile',
    authorizedProfile: { cloudID: 'verified-cloud-id' }
  });
});

test('failed score upload is queued locally for the next login', async () => {
  const { storage, wxMock } = createWxMock([new Error('offline')]);
  const service = new WechatLeaderboard(wxMock, { cloudFunctionName: 'leaderboard' });
  await assert.rejects(() => service.submitScore({ score: 450, level: 3, won: false }), /offline/);
  assert.deepEqual(storage.get(PENDING_SCORE_KEY), { score: 450, level: 3, won: false });
});
