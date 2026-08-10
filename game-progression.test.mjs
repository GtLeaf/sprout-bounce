import assert from 'node:assert/strict';
import test from 'node:test';
import { EXPLOSION_TIMING, LEVELS, REWARD_TILE_THRESHOLDS, TILES_PER_ROUND, TILE_COLORS, rewardRankForTileCount, roundsForTileCount } from './game-config.mjs';

test('campaign provides eight progressively harder levels', () => {
  assert.equal(LEVELS.length, 8);
  assert.ok(new Set(LEVELS.map((level) => level.difficulty)).size >= 4);
  for (let index = 1; index < LEVELS.length; index += 1) {
    assert.ok(LEVELS[index].roundGoal >= LEVELS[index - 1].roundGoal);
    assert.ok(LEVELS[index].time <= LEVELS[index - 1].time);
    assert.ok(LEVELS[index].warning <= LEVELS[index - 1].warning);
  }
});

test('final exploded tile count converts large groups into multiple rounds', () => {
  assert.equal(TILES_PER_ROUND, 4);
  assert.deepEqual(LEVELS.map((level) => level.roundGoal), [5, 6, 7, 8, 10, 12, 14, 16]);
  const expectedRounds = new Map([
    [3, 0], [4, 1], [7, 1], [8, 2], [11, 2], [12, 3], [15, 3], [16, 4], [49, 12]
  ]);
  for (const [tileCount, rounds] of expectedRounds) {
    assert.equal(roundsForTileCount(tileCount), rounds);
  }
});

test('every level keeps time to build a larger connected group', () => {
  assert.equal(LEVELS[0].warning, 6.0);
  assert.equal(LEVELS.at(-1).warning, 4.6);
  assert.ok(LEVELS.every((level) => level.warning >= 4.6));
});

test('burst collapse has a readable half-second cascade', () => {
  const fourTileLineFinish = EXPLOSION_TIMING.burstBase
    + 1.5 * EXPLOSION_TIMING.burstDistance
    + 3 * EXPLOSION_TIMING.burstStagger;
  assert.ok(EXPLOSION_TIMING.burstBase >= 0.28);
  assert.ok(EXPLOSION_TIMING.burstDistance >= 0.08);
  assert.ok(EXPLOSION_TIMING.burstStagger >= 0.04);
  assert.ok(fourTileLineFinish >= 0.54);
});

test('tile colors remain distinct on a small board', () => {
  assert.equal(TILE_COLORS.length, 6);
  const channels = TILE_COLORS.map(({ hex }) => [hex >> 16, (hex >> 8) & 0xff, hex & 0xff]);
  for (let first = 0; first < channels.length; first += 1) {
    for (let second = first + 1; second < channels.length; second += 1) {
      const distance = Math.hypot(...channels[first].map((value, index) => value - channels[second][index]));
      assert.ok(distance >= 50, `${TILE_COLORS[first].name}和${TILE_COLORS[second].name}过于接近`);
    }
  }
  const orange = channels[0];
  const red = channels[5];
  assert.ok(Math.hypot(...orange.map((value, index) => value - red[index])) >= 65);
});

test('six rewards are determined only by final exploded tile count', () => {
  assert.deepEqual(REWARD_TILE_THRESHOLDS, [4, 5, 6, 8, 10, 12]);
  const expectedRanks = new Map([
    [3, -1], [4, 0], [5, 1], [6, 2], [7, 2], [8, 3], [9, 3],
    [10, 4], [11, 4], [12, 5], [49, 5]
  ]);
  for (const [tileCount, rank] of expectedRanks) {
    assert.equal(rewardRankForTileCount(tileCount), rank);
  }
});
