const crypto = require('crypto');

const MAX_SCORE = 999999999;
const MAX_LEVEL = 8;
const MAX_PROFILE_AGE_MS = 10 * 60 * 1000;

function playerIdFromContext(wxContext) {
  const openId = String(wxContext?.OPENID || '').trim();
  if (!openId) throw new Error('无法识别当前微信玩家');
  return openId;
}

function operationOwner(wxContext, _untrustedEvent) {
  return playerIdFromContext(wxContext);
}

function anonymousName(openId) {
  const suffix = crypto.createHash('sha256').update(openId).digest('hex').slice(0, 4).toUpperCase();
  return `微信玩家 ${suffix}`;
}

function cleanText(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

function normalizeScore(input) {
  return {
    score: Math.min(MAX_SCORE, Math.max(0, Math.floor(Number(input?.score) || 0))),
    level: Math.min(MAX_LEVEL, Math.max(1, Math.floor(Number(input?.level) || 1))),
    won: Boolean(input?.won)
  };
}

function mergeScore(player, input, now = Date.now()) {
  const score = normalizeScore(input);
  const current = player || {};
  const previousBest = Number(current.bestScore) || 0;
  const previousLevel = Number(current.bestLevel) || 1;
  const replacesBest = score.score > previousBest
    || (score.score === previousBest && score.level > previousLevel);

  return {
    ...current,
    bestScore: replacesBest ? score.score : previousBest,
    bestLevel: replacesBest ? score.level : previousLevel,
    bestWon: Boolean(current.bestWon || score.won),
    gamesPlayed: Math.max(0, Math.floor(Number(current.gamesPlayed) || 0)) + 1,
    updatedAt: now
  };
}

function verifiedOpenDataField(openDataInfo, expectedField) {
  try {
    const info = typeof openDataInfo === 'string' ? JSON.parse(openDataInfo) : openDataInfo;
    return Array.isArray(info?.keys) && info.keys.includes(expectedField);
  } catch {
    return false;
  }
}

function verifiedProfilePayload(cloudValue, expectedAppId, now = Date.now(), openDataInfo) {
  const data = cloudValue?.data;
  const watermark = data?.watermark;
  const timestampMs = Number(watermark?.timestamp) * 1000;
  if (!verifiedOpenDataField(openDataInfo, 'authorizedProfile')
    || !data || !watermark || watermark.appid !== expectedAppId) {
    throw new Error('微信头像昵称校验失败');
  }
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > MAX_PROFILE_AGE_MS) {
    throw new Error('微信头像昵称授权已过期，请重新授权');
  }
  const displayName = cleanText(data.nickName, 32);
  const avatarUrl = cleanText(data.avatarUrl, 512).replace(/^http:/i, 'https:');
  if (!displayName) throw new Error('微信昵称为空');
  if (avatarUrl && !/^https:\/\//i.test(avatarUrl)) throw new Error('微信头像地址无效');
  return { displayName, avatarUrl, profileAuthorized: true, profileAuthorizedAt: now };
}

function comparePlayers(a, b) {
  return (Number(b.bestScore) || 0) - (Number(a.bestScore) || 0)
    || (Number(b.bestLevel) || 1) - (Number(a.bestLevel) || 1)
    || (Number(a.updatedAt) || 0) - (Number(b.updatedAt) || 0);
}

function rankForPlayer(players, playerId) {
  const sorted = players.filter((player) => (Number(player.gamesPlayed) || 0) > 0).sort(comparePlayers);
  const index = sorted.findIndex((player) => player._id === playerId);
  return index < 0 ? null : index + 1;
}

function publicPlayer(player) {
  if (!player) return null;
  return {
    displayName: cleanText(player.displayName, 32) || '微信玩家',
    avatarUrl: cleanText(player.avatarUrl, 512),
    bestScore: Math.max(0, Math.floor(Number(player.bestScore) || 0)),
    bestLevel: Math.max(1, Math.floor(Number(player.bestLevel) || 1)),
    bestWon: Boolean(player.bestWon),
    gamesPlayed: Math.max(0, Math.floor(Number(player.gamesPlayed) || 0))
  };
}

function publicEntry(player) {
  const entry = publicPlayer(player);
  return entry && {
    displayName: entry.displayName,
    avatarUrl: entry.avatarUrl,
    bestScore: entry.bestScore,
    bestLevel: entry.bestLevel,
    bestWon: entry.bestWon,
    gamesPlayed: entry.gamesPlayed
  };
}

module.exports = {
  MAX_LEVEL,
  MAX_PROFILE_AGE_MS,
  MAX_SCORE,
  anonymousName,
  comparePlayers,
  mergeScore,
  normalizeScore,
  operationOwner,
  playerIdFromContext,
  publicEntry,
  publicPlayer,
  rankForPlayer,
  verifiedOpenDataField,
  verifiedProfilePayload
};
