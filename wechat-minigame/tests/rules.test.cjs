const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BOARD_SIZE,
  applyLanding,
  connectedComponent,
  createBoard,
  movePosition,
  tileIndex
} = require('../src/rules');

test('creates a complete 7 by 7 board', () => {
  const board = createBoard(() => 0.25);
  assert.equal(board.length, BOARD_SIZE * BOARD_SIZE);
  assert.ok(board.every((color) => color >= 0 && color <= 5));
});

test('connected groups only include orthogonal neighbors', () => {
  const board = Array(49).fill(2);
  board[tileIndex(3, 3)] = 1;
  board[tileIndex(2, 2)] = 1;
  board[tileIndex(4, 4)] = 1;
  assert.deepEqual(connectedComponent(board, tileIndex(3, 3)), [tileIndex(3, 3)]);
});

test('landing cycles the tile and clears a four-tile component', () => {
  const board = Array(49).fill(4);
  board[tileIndex(3, 3)] = 0;
  board[tileIndex(2, 3)] = 1;
  board[tileIndex(3, 2)] = 1;
  board[tileIndex(3, 4)] = 1;
  const result = applyLanding(board, { row: 3, col: 3 }, () => 0);
  assert.equal(result.cleared.length, 4);
  assert.equal(result.points, 200);
  assert.equal(result.rounds, 1);
});

test('movement never leaves the board', () => {
  const corner = { row: 0, col: 0 };
  assert.equal(movePosition(corner, 'up'), corner);
  assert.equal(movePosition(corner, 'left'), corner);
  assert.deepEqual(movePosition(corner, 'right'), { row: 0, col: 1 });
});
