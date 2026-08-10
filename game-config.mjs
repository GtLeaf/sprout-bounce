export const LEVELS = Object.freeze([
  { name: '初芽庭院', difficulty: '入门', time: 105, roundGoal: 5, warning: 6.0 },
  { name: '彩虹小径', difficulty: '入门', time: 100, roundGoal: 6, warning: 5.8 },
  { name: '软糖广场', difficulty: '标准', time: 96, roundGoal: 7, warning: 5.6 },
  { name: '云朵回廊', difficulty: '标准', time: 92, roundGoal: 8, warning: 5.4 },
  { name: '风车花园', difficulty: '进阶', time: 88, roundGoal: 10, warning: 5.2 },
  { name: '星光高台', difficulty: '进阶', time: 84, roundGoal: 12, warning: 5.0 },
  { name: '极光风暴', difficulty: '挑战', time: 80, roundGoal: 14, warning: 4.8 },
  { name: '彩虹之巅', difficulty: '挑战', time: 76, roundGoal: 16, warning: 4.6 }
].map(Object.freeze));

export const EXPLOSION_TIMING = Object.freeze({
  burstBase: 0.28,
  burstDistance: 0.085,
  burstStagger: 0.045
});

export const REWARD_TILE_THRESHOLDS = Object.freeze([4, 5, 6, 8, 10, 12]);
export const TILES_PER_ROUND = 4;

export function roundsForTileCount(tileCount) {
  const count = Math.floor(Number(tileCount));
  if (!Number.isFinite(count) || count < TILES_PER_ROUND) return 0;
  return Math.floor(count / TILES_PER_ROUND);
}

export function rewardRankForTileCount(tileCount) {
  const count = Math.floor(Number(tileCount));
  if (!Number.isFinite(count)) return -1;
  for (let rank = REWARD_TILE_THRESHOLDS.length - 1; rank >= 0; rank -= 1) {
    if (count >= REWARD_TILE_THRESHOLDS[rank]) return rank;
  }
  return -1;
}

export const TILE_COLORS = Object.freeze([
  { name: '橙', hex: 0xf69d46 },
  { name: '黄', hex: 0xf6d14e },
  { name: '绿', hex: 0x7acd5a },
  { name: '蓝', hex: 0x42b4df },
  { name: '紫', hex: 0xc982d7 },
  { name: '红', hex: 0xf06b70 }
].map(Object.freeze));
