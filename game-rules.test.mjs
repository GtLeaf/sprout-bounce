import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isChallengingStartBoard, orthogonalComponent } from './game-rules.mjs';

const gameSource = await readFile(new URL('./game.js', import.meta.url), 'utf8');

const SIZE = 7;
const makeBoard = () => ({
  colors: Array.from({ length: SIZE * SIZE }, (_, index) => (Math.floor(index / SIZE) + index % SIZE) % 2),
  states: Array(SIZE * SIZE).fill('solid')
});
const indexAt = (row, col) => row * SIZE + col;
const paint = (board, cells, color = 5) => cells.forEach(([row, col]) => { board.colors[indexAt(row, col)] = color; });

test('starting board rejects current or one-visit four groups', () => {
  assert.equal(isChallengingStartBoard(Array(49).fill(0), SIZE, 6), false);
  const oneVisitLine = Array.from({ length: 49 }, (_, index) => (Math.floor(index / SIZE) * 2 + (index % SIZE) * 3) % 6);
  assert.equal(isChallengingStartBoard(oneVisitLine, SIZE, 6), true);
  const oneVisitTrap = [...oneVisitLine];
  [[3, 1, 3], [3, 2, 2], [3, 3, 2], [3, 4, 2]].forEach(([row, col, color]) => {
    oneVisitTrap[indexAt(row, col)] = color;
  });
  assert.equal(isChallengingStartBoard(oneVisitTrap, SIZE, 6), false);
  const changed = [...oneVisitLine];
  changed[indexAt(3, 3)] = 2;
  assert.equal(isChallengingStartBoard(changed, SIZE, 6), true);
});

test('four-tile line, square, L, and T shapes are valid combinations', () => {
  const shapes = [
    [[3, 1], [3, 2], [3, 3], [3, 4]],
    [[2, 2], [2, 3], [3, 2], [3, 3]],
    [[2, 2], [3, 2], [4, 2], [4, 3]],
    [[2, 3], [3, 2], [3, 3], [3, 4]]
  ];
  for (const shape of shapes) {
    const board = makeBoard();
    paint(board, shape);
    assert.equal(orthogonalComponent(board.colors, board.states, indexAt(...shape[0]), SIZE).length, 4);
  }
});

test('diagonal tiles never connect', () => {
  const board = makeBoard();
  const diagonal = [[1, 1], [2, 2], [3, 3], [4, 4]];
  paint(board, diagonal);
  for (const cell of diagonal) {
    assert.equal(orthogonalComponent(board.colors, board.states, indexAt(...cell), SIZE).length, 1);
  }
});

test('one to three connected tiles stay below the collapse threshold', () => {
  const shapes = [
    [[3, 3]],
    [[3, 2], [3, 3]],
    [[3, 2], [3, 3], [3, 4]]
  ];
  for (const shape of shapes) {
    const board = makeBoard();
    paint(board, shape);
    assert.equal(orthogonalComponent(board.colors, board.states, indexAt(...shape[0]), SIZE).length, shape.length);
  }
});

test('nearby same-color tiles do not join a disconnected valid group', () => {
  const board = makeBoard();
  const source = [[3, 1], [3, 2], [3, 3], [2, 2]];
  paint(board, source);
  paint(board, [[3, 5], [4, 4]]);
  const sourceGroup = orthogonalComponent(board.colors, board.states, indexAt(3, 2), SIZE);
  assert.equal(sourceGroup.length, 4);
  assert.ok(!sourceGroup.includes(indexAt(3, 5)));
  assert.ok(!sourceGroup.includes(indexAt(4, 4)));
});

test('newly refilled or warning tiles cannot create an automatic solid match', () => {
  const board = makeBoard();
  const cells = [[3, 1], [3, 2], [3, 3], [3, 4]];
  paint(board, cells);
  board.states[indexAt(3, 4)] = 'growing';
  assert.equal(orthogonalComponent(board.colors, board.states, indexAt(3, 2), SIZE).length, 3);
  board.states[indexAt(3, 4)] = 'warn';
  assert.equal(orthogonalComponent(board.colors, board.states, indexAt(3, 2), SIZE).length, 3);
});

test('solid tiles can join an orthogonally connected burst until its last tile pops', () => {
  const board = makeBoard();
  const cells = [[3, 1], [3, 2], [3, 3], [3, 4]];
  paint(board, cells);
  board.states[indexAt(3, 1)] = 'bursting';
  const active = orthogonalComponent(
    board.colors,
    board.states,
    indexAt(3, 4),
    SIZE,
    ['solid', 'warn', 'bursting']
  );
  assert.equal(active.length, 4);
  board.states[indexAt(3, 1)] = 'falling';
  const finished = orthogonalComponent(
    board.colors,
    board.states,
    indexAt(3, 4),
    SIZE,
    ['solid', 'warn', 'bursting']
  );
  assert.equal(finished.length, 3);
});

test('components respect board edges without wrapping rows', () => {
  const board = makeBoard();
  paint(board, [[0, 6], [1, 6], [2, 6], [3, 6]]);
  paint(board, [[1, 0]]);
  const group = orthogonalComponent(board.colors, board.states, indexAt(0, 6), SIZE);
  assert.equal(group.length, 4);
  assert.ok(!group.includes(indexAt(1, 0)));
});

test('gameplay has no secondary blast path for disconnected tiles', () => {
  assert.match(gameSource, /let group = connectedMatch\(tile, true, true\);[\s\S]*?if \(group\.length < 4\) return \[\];[\s\S]*?igniteTiles\(group, 0, LEVELS\[state\.level\]\.warning\);/);
  assert.doesNotMatch(gameSource, /cardinalBlastTargets|chainTargetsFor|chainTargets/);
});

test('a chain always leaves one escape tile so the board cannot vanish at once', () => {
  assert.match(gameSource, /const MAX_COLLAPSING_TILES = BOARD \* BOARD - 1/);
  assert.match(gameSource, /function keepEscapeTile\(group\)/);
  assert.match(gameSource, /group = keepEscapeTile\(group\);[\s\S]*?if \(group\.length < 4\) return \[\];/);
  assert.match(gameSource, /function explodeGroup\(group\) \{\s+group = keepEscapeTile\(group\);/);
});

test('flashing groups absorb newly connected same-color solid tiles', () => {
  assert.match(gameSource, /const flashing = group\.filter\(\(member\) => member\.userData\.state === 'warn'\)/);
  assert.match(gameSource, /const warningId = flashing\.reduce\(\(earliest, member\) =>/);
  assert.match(gameSource, /member\.userData\.state === 'solid' \|\| member\.userData\.warningId === warningId/);
  assert.match(gameSource, /const added = group\.filter\(\(member\) => member\.userData\.state === 'solid'\)/);
  assert.match(gameSource, /const remaining = Math\.max\(0\.05, Math\.min/);
  assert.match(gameSource, /member\.userData\.state = 'warn';[\s\S]*?member\.userData\.timer = remaining;/);
});

test('active bursts absorb connected same-color tiles and leave one hop to escape', () => {
  assert.match(gameSource, /const bursting = group\.filter\(\(member\) => member\.userData\.state === 'bursting'\)/);
  assert.match(gameSource, /const warningId = bursting\.reduce\(\(earliest, member\) =>/);
  assert.match(gameSource, /const activeBursting = group\.filter\(\(member\) => member\.userData\.state === 'bursting'\)/);
  assert.match(gameSource, /function extendBurstingGroup\(group, bursting\)[\s\S]*?state === 'solid' \|\| member\.userData\.state === 'warn'/);
  assert.match(gameSource, /const escapeWindow = HOP_DURATION \+ 0\.08/);
  assert.match(gameSource, /setBurstingTile\([\s\S]*?state\.refillRemaining \+= added\.length;[\s\S]*?state\.score \+= points;/);
  assert.match(gameSource, /state\.currentTile === tile;[\s\S]*?if \(playerCaught\) loseLife\('被爆破卷走了', 'blast'\);/);
});

test('reward waits for the final burst size and stays on the burst anchor', () => {
  assert.match(gameSource, /pendingRewards: new Map\(\)/);
  assert.match(gameSource, /const anchorTile = ordered\.find\(\(tile\) => tile !== state\.currentTile\) \|\| ordered\[0\]/);
  assert.match(gameSource, /state\.pendingRewards\.set\(group\[0\]\.userData\.warningId, \{ tileCount: group\.length, anchorTile \}\)/);
  assert.match(gameSource, /pendingReward\.tileCount \+= added\.length/);
  assert.match(gameSource, /const stillBursting = tiles\.some[\s\S]*?rewardRankForTileCount\(reward\.tileCount\)[\s\S]*?spawnBonus\(rewardRank, reward\.tileCount, reward\.anchorTile\)/);
  assert.match(gameSource, /function spawnBonus\(rank = 0, tileCount = null, anchorTile = null\)[\s\S]*?anchorTile\.userData\.pendingBonus = \{ rank, tileCount \}/);
  assert.match(gameSource, /if \(data\.pendingBonus\)[\s\S]*?attachBonus\(tile, pending\.rank, pending\.tileCount\)/);
  assert.match(gameSource, /const gainedRounds = roundsForTileCount\(reward\.tileCount\)[\s\S]*?state\.rounds \+= gainedRounds[\s\S]*?state\.rounds >= LEVELS\[state\.level\]\.roundGoal/);
  assert.doesNotMatch(gameSource, /state\.combo \+= 1/);
  assert.doesNotMatch(gameSource, /Math\.random\(\) < 0\.72|schedule\(spawnBonus, 450\)/);
  assert.match(gameSource, /new THREE\.IcosahedronGeometry\(0\.37, 0\)/);
  assert.match(gameSource, /new THREE\.OctahedronGeometry\(0\.4, 0\)/);
  assert.match(gameSource, /new THREE\.DodecahedronGeometry\(0\.39, 0\)/);
  assert.match(gameSource, /new THREE\.CylinderGeometry\(0\.42, 0\.06, 0\.44, 8\)/);
});

test('replacement tiles grow from the board instead of falling from above', () => {
  assert.match(gameSource, /data\.state = 'growing';[\s\S]*?tile\.position\.y = -0\.42;[\s\S]*?tile\.scale\.set\(0\.78, 0\.06, 0\.78\);/);
  assert.doesNotMatch(gameSource, /data\.state = 'dropping'|tile\.position\.y = 5\.5/);
});

test('tiles use rounded geometry and a damped landing bounce', () => {
  assert.match(gameSource, /new RoundedBoxGeometry\(SIZE, 0\.72, SIZE, 3, 0\.23\)/);
  assert.match(gameSource, /new RoundedBoxGeometry\(SIZE - 0\.12, 0\.1, SIZE - 0\.12, 2, 0\.16\)/);
  assert.match(gameSource, /bounceStrength = 1\.15;[\s\S]*?function updateTileBounce/);
  assert.match(gameSource, /Math\.cos\(data\.bounceAge \* 19\) \* data\.bounceStrength/);
  assert.match(gameSource, /tile\.scale\.set\(1 \+ wave \* 0\.075, 1 - wave \* 0\.16, 1 \+ wave \* 0\.075\)/);
});
