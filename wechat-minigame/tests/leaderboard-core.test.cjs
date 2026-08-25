const test = require('node:test');
const assert = require('node:assert/strict');
const {
  anonymousName,
  mergeScore,
  operationOwner,
  publicEntry,
  rankForPlayer,
  verifiedProfilePayload
} = require('../cloudfunctions/leaderboard/core');

test('player identity is stable and comes only from cloud WeChat context', () => {
  const context = { OPENID: 'real-player-openid', APPID: 'wx-game' };
  const forgedEvent = { openid: 'victim-openid', playerId: 'victim-id', _id: 'victim-id' };
  assert.equal(operationOwner(context, forgedEvent), 'real-player-openid');
  assert.equal(operationOwner(context, {}), 'real-player-openid');
  assert.equal(anonymousName('real-player-openid'), anonymousName('real-player-openid'));
  assert.notEqual(anonymousName('real-player-openid'), anonymousName('another-openid'));
});

test('returning player keeps the historical best after a lower score', () => {
  const existing = { bestScore: 1200, bestLevel: 5, gamesPlayed: 3, bestWon: false };
  const lower = mergeScore(existing, { score: 800, level: 4, won: false }, 100);
  assert.equal(lower.bestScore, 1200);
  assert.equal(lower.bestLevel, 5);
  assert.equal(lower.gamesPlayed, 4);

  const higher = mergeScore(lower, { score: 1600, level: 6, won: true }, 200);
  assert.equal(higher.bestScore, 1600);
  assert.equal(higher.bestLevel, 6);
  assert.equal(higher.bestWon, true);
  assert.equal(higher.gamesPlayed, 5);
});

test('nickname and avatar are accepted only from a fresh verified CloudID payload', () => {
  const now = 1_800_000_000_000;
  const payload = {
    data: {
      nickName: '  跳跳高手  ',
      avatarUrl: 'http://thirdwx.qlogo.cn/avatar/0',
      watermark: { appid: 'wx-game', timestamp: now / 1000 }
    }
  };
  const verifiedOpenData = JSON.stringify({ keys: ['authorizedProfile'] });
  assert.deepEqual(verifiedProfilePayload(payload, 'wx-game', now, verifiedOpenData), {
    displayName: '跳跳高手',
    avatarUrl: 'https://thirdwx.qlogo.cn/avatar/0',
    profileAuthorized: true,
    profileAuthorizedAt: now
  });
  assert.throws(() => verifiedProfilePayload(payload, 'another-app', now, verifiedOpenData), /校验失败/);
  assert.throws(() => verifiedProfilePayload(payload, 'wx-game', now, ''), /校验失败/);
  assert.throws(() => verifiedProfilePayload(
    { data: { nickName: '伪造昵称', watermark: { appid: 'wx-game', timestamp: now / 1000 } } },
    'wx-game',
    now,
    JSON.stringify({ keys: [] })
  ), /校验失败/);
});

test('public leaderboard data never exposes OpenID or internal document IDs', () => {
  const entry = publicEntry({
    _id: 'secret-openid',
    displayName: '玩家甲',
    avatarUrl: 'https://example.test/a.png',
    bestScore: 300,
    bestLevel: 2,
    gamesPlayed: 1
  });
  assert.equal(entry.displayName, '玩家甲');
  assert.equal(Object.hasOwn(entry, '_id'), false);
  assert.equal(Object.hasOwn(entry, 'openid'), false);
});

test('returning player rank can be reconstructed from stored records', () => {
  const players = [
    { _id: 'a', bestScore: 900, bestLevel: 3, gamesPlayed: 2, updatedAt: 10 },
    { _id: 'me', bestScore: 700, bestLevel: 4, gamesPlayed: 3, updatedAt: 20 },
    { _id: 'c', bestScore: 100, bestLevel: 1, gamesPlayed: 1, updatedAt: 30 }
  ];
  assert.equal(rankForPlayer(players, 'me'), 2);
});
