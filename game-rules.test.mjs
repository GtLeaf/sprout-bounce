import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { orthogonalComponent } from './game-rules.mjs';

const gameSource = await readFile(new URL('./game.js', import.meta.url), 'utf8');

const SIZE = 7;
const makeBoard = () => ({
  colors: Array.from({ length: SIZE * SIZE }, (_, index) => (Math.floor(index / SIZE) + index % SIZE) % 2),
  states: Array(SIZE * SIZE).fill('solid')
});
const indexAt = (row, col) => row * SIZE + col;
const paint = (board, cells, color = 5) => cells.forEach(([row, col]) => { board.colors[indexAt(row, col)] = color; });

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

test('components respect board edges without wrapping rows', () => {
  const board = makeBoard();
  paint(board, [[0, 6], [1, 6], [2, 6], [3, 6]]);
  paint(board, [[1, 0]]);
  const group = orthogonalComponent(board.colors, board.states, indexAt(0, 6), SIZE);
  assert.equal(group.length, 4);
  assert.ok(!group.includes(indexAt(1, 0)));
});

test('gameplay has no secondary blast path for disconnected tiles', () => {
  assert.match(gameSource, /const group = connectedMatch\(tile, true\);[\s\S]*?if \(group\.length < 4\) return \[\];[\s\S]*?igniteTiles\(group, 0, LEVELS\[state\.level\]\.warning\);/);
  assert.doesNotMatch(gameSource, /cardinalBlastTargets|chainTargetsFor|chainTargets/);
});

test('flashing groups absorb newly connected same-color solid tiles', () => {
  assert.match(gameSource, /const flashing = group\.filter\(\(member\) => member\.userData\.state === 'warn'\)/);
  assert.match(gameSource, /const added = group\.filter\(\(member\) => member\.userData\.state === 'solid'\)/);
  assert.match(gameSource, /const remaining = Math\.max\(0\.05, Math\.min/);
  assert.match(gameSource, /member\.userData\.state = 'warn';[\s\S]*?member\.userData\.timer = remaining;/);
});

test('replacement tiles grow from the board instead of falling from above', () => {
  assert.match(gameSource, /data\.state = 'growing';[\s\S]*?tile\.position\.y = -0\.42;[\s\S]*?tile\.scale\.set\(0\.78, 0\.06, 0\.78\);/);
  assert.doesNotMatch(gameSource, /data\.state = 'dropping'|tile\.position\.y = 5\.5/);
});

test('tiles use rounded geometry and a damped landing bounce', () => {
  assert.match(gameSource, /new RoundedBoxGeometry\(SIZE, 0\.72, SIZE, 3, 0\.23\)/);
  assert.match(gameSource, /new RoundedBoxGeometry\(SIZE - 0\.12, 0\.1, SIZE - 0\.12, 2, 0\.16\)/);
  assert.match(gameSource, /bounceStrength = 1;[\s\S]*?function updateTileBounce/);
  assert.match(gameSource, /Math\.cos\(data\.bounceAge \* 17\) \* data\.bounceStrength/);
});
