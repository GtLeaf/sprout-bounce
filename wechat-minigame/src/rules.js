const BOARD_SIZE = 7;
const COLOR_COUNT = 6;

const LEVELS = Object.freeze([
  { name: '初芽庭院', time: 105, goal: 5 },
  { name: '彩虹小径', time: 100, goal: 6 },
  { name: '软糖广场', time: 96, goal: 7 },
  { name: '云朵回廊', time: 92, goal: 8 },
  { name: '风车花园', time: 88, goal: 10 },
  { name: '星光高台', time: 84, goal: 12 },
  { name: '极光风暴', time: 80, goal: 14 },
  { name: '彩虹之巅', time: 76, goal: 16 }
]);

function tileIndex(row, col, size = BOARD_SIZE) {
  return row * size + col;
}

function createBoard(random = Math.random, size = BOARD_SIZE, colorCount = COLOR_COUNT) {
  const board = [];
  const offset = Math.floor(random() * colorCount);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      board.push((row * 2 + col * 3 + offset) % colorCount);
    }
  }
  return board;
}

function connectedComponent(board, startIndex, size = BOARD_SIZE) {
  if (!Array.isArray(board) || startIndex < 0 || startIndex >= board.length) return [];
  const color = board[startIndex];
  const result = [];
  const pending = [startIndex];
  const seen = new Set([startIndex]);

  while (pending.length) {
    const current = pending.shift();
    result.push(current);
    const row = Math.floor(current / size);
    const col = current % size;
    const neighbors = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1]
    ];
    for (const [nextRow, nextCol] of neighbors) {
      if (nextRow < 0 || nextRow >= size || nextCol < 0 || nextCol >= size) continue;
      const next = tileIndex(nextRow, nextCol, size);
      if (!seen.has(next) && board[next] === color) {
        seen.add(next);
        pending.push(next);
      }
    }
  }
  return result;
}

function movePosition(position, direction, size = BOARD_SIZE) {
  const deltas = {
    up: [-1, 0],
    down: [1, 0],
    left: [0, -1],
    right: [0, 1]
  };
  const delta = deltas[direction];
  if (!delta) return position;
  const row = position.row + delta[0];
  const col = position.col + delta[1];
  if (row < 0 || row >= size || col < 0 || col >= size) return position;
  return { row, col };
}

function applyLanding(board, position, random = Math.random) {
  const nextBoard = board.slice();
  const index = tileIndex(position.row, position.col);
  nextBoard[index] = (nextBoard[index] + 1) % COLOR_COUNT;
  const group = connectedComponent(nextBoard, index);
  if (group.length < 4) {
    return { board: nextBoard, cleared: [], points: 0, rounds: 0 };
  }
  for (const clearedIndex of group) {
    nextBoard[clearedIndex] = Math.floor(random() * COLOR_COUNT);
  }
  return {
    board: nextBoard,
    cleared: group,
    points: group.length * 50,
    rounds: Math.floor(group.length / 4)
  };
}

module.exports = {
  BOARD_SIZE,
  COLOR_COUNT,
  LEVELS,
  applyLanding,
  connectedComponent,
  createBoard,
  movePosition,
  tileIndex
};
