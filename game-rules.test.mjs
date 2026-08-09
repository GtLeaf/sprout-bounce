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
  board.states[indexAt(3, 4)] = 'dropping';
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
  assert.match(gameSource, /if \(group\.length < 4\) return \[\];[\s\S]*?igniteTiles\(group, 0, 1\.16\);/);
  assert.doesNotMatch(gameSource, /cardinalBlastTargets|chainTargetsFor|chainTargets/);
});
