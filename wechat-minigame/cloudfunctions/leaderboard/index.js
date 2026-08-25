const cloud = require('wx-server-sdk');
const {
  anonymousName,
  comparePlayers,
  mergeScore,
  operationOwner,
  publicEntry,
  publicPlayer,
  rankForPlayer,
  verifiedProfilePayload
} = require('./core');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const players = db.collection('happy_jump_players');

function timestampValue(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.getTime === 'function') return value.getTime();
  return Number(value) || 0;
}

function normalizeStoredPlayer(player) {
  if (!player) return player;
  return {
    ...player,
    createdAt: timestampValue(player.createdAt),
    updatedAt: timestampValue(player.updatedAt),
    profileAuthorizedAt: timestampValue(player.profileAuthorizedAt)
  };
}

async function readPlayer(playerId) {
  try {
    const result = await players.doc(playerId).get();
    return normalizeStoredPlayer(result.data);
  } catch (error) {
    if (error?.errCode === -1 || /does not exist|not found/i.test(error?.message || '')) return null;
    throw error;
  }
}

async function ensurePlayer(playerId, now) {
  const existing = await readPlayer(playerId);
  if (existing) {
    await players.doc(playerId).update({ data: { lastLoginAt: db.serverDate() } });
    return existing;
  }
  const created = {
    _id: playerId,
    displayName: anonymousName(playerId),
    avatarUrl: '',
    profileAuthorized: false,
    bestScore: 0,
    bestLevel: 1,
    bestWon: false,
    gamesPlayed: 0,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now
  };
  try {
    const { _id, ...createdData } = created;
    await players.doc(playerId).set({ data: createdData });
    return created;
  } catch (error) {
    // Two first-launch calls can race. In that case the already-created row wins.
    const racedPlayer = await readPlayer(playerId);
    if (racedPlayer) return racedPlayer;
    throw error;
  }
}

async function rankedPlayers(limit = 20) {
  const count = Math.max(1, Math.min(50, Math.floor(Number(limit) || 20)));
  const result = await players
    .orderBy('bestScore', 'desc')
    .limit(100)
    .get();
  return result.data
    .map(normalizeStoredPlayer)
    .filter((player) => (Number(player.gamesPlayed) || 0) > 0)
    .sort(comparePlayers)
    .slice(0, count);
}

async function buildResponse(playerId, player, limit = 20) {
  const ranked = await rankedPlayers(limit);
  let myRank = rankForPlayer(ranked, playerId);
  if (myRank == null && player.gamesPlayed > 0) {
    const higherScore = await players.where({ bestScore: db.command.gt(player.bestScore) }).count();
    myRank = higherScore.total + 1;
  }
  return {
    ok: true,
    player: publicPlayer(player),
    entries: ranked.map(publicEntry),
    myRank
  };
}

async function submitScore(playerId, currentPlayer, event, now) {
  return db.runTransaction(async (transaction) => {
    const document = transaction.collection('happy_jump_players').doc(playerId);
    const latestResult = await document.get();
    const latest = normalizeStoredPlayer(latestResult.data || currentPlayer);
    const merged = mergeScore(latest, event, now);
    await document.update({
      data: {
        bestScore: merged.bestScore,
        bestLevel: merged.bestLevel,
        bestWon: merged.bestWon,
        gamesPlayed: merged.gamesPlayed,
        updatedAt: db.serverDate()
      }
    });
    return merged;
  });
}

exports.main = async (event = {}) => {
  try {
    const wxContext = cloud.getWXContext();
    const playerId = operationOwner(wxContext, event);
    const now = Date.now();
    let player = await ensurePlayer(playerId, now);

    if (event.action === 'updateProfile') {
      const profile = verifiedProfilePayload(
        event.authorizedProfile,
        wxContext.APPID,
        now,
        wxContext.OPEN_DATA_INFO
      );
      await players.doc(playerId).update({ data: { ...profile, updatedAt: db.serverDate() } });
      player = { ...player, ...profile, updatedAt: now };
    } else if (event.action === 'submitScore') {
      player = await submitScore(playerId, player, event, now);
    } else if (!['login', 'list', undefined].includes(event.action)) {
      throw new Error('不支持的排行榜操作');
    }

    return buildResponse(playerId, player, event.limit);
  } catch (error) {
    console.error('leaderboard function failed', error);
    return { ok: false, message: error?.message || '排行榜服务异常' };
  }
};
