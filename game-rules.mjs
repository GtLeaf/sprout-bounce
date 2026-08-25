const CARDINAL_STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * A safe starting board has no orthogonal group of four that can be formed
 * by visiting each tile once. A tile is a candidate for target colour T when
 * it is already T or its next landing colour is T.
 */
export function isChallengingStartBoard(colors, size, colorCount = 6) {
  if (!Array.isArray(colors) || !Number.isInteger(size) || size < 1
    || !Number.isInteger(colorCount) || colorCount < 2
    || colors.length !== size * size) return false;
  if (colors.some((color) => !Number.isInteger(color) || color < 0 || color >= colorCount)) return false;

  for (let target = 0; target < colorCount; target += 1) {
    const candidates = colors.map((color) => color === target || ((color + 1) % colorCount) === target);
    const seen = new Set();
    for (let start = 0; start < candidates.length; start += 1) {
      if (!candidates[start] || seen.has(start)) continue;
      const pending = [start];
      seen.add(start);
      let componentSize = 0;
      while (pending.length) {
        const index = pending.shift();
        componentSize += 1;
        if (componentSize >= 4) return false;
        const row = Math.floor(index / size);
        const col = index % size;
        for (const [rowDelta, colDelta] of CARDINAL_STEPS) {
          const nextRow = row + rowDelta;
          const nextCol = col + colDelta;
          if (nextRow < 0 || nextRow >= size || nextCol < 0 || nextCol >= size) continue;
          const nextIndex = nextRow * size + nextCol;
          if (candidates[nextIndex] && !seen.has(nextIndex)) {
            seen.add(nextIndex);
            pending.push(nextIndex);
          }
        }
      }
    }
  }
  return true;
}

function validIndex(index, size, colors, states) {
  return Number.isInteger(index) && index >= 0 && index < size * size
    && colors.length === size * size && states.length === size * size;
}

export function orthogonalComponent(colors, states, startIndex, size, allowedStates = ['solid']) {
  if (!validIndex(startIndex, size, colors, states)) return [];
  const allowed = new Set(allowedStates);
  const color = colors[startIndex];
  if (!allowed.has(states[startIndex])) return [];
  const connected = [];
  const pending = [startIndex];
  const seen = new Set(pending);
  while (pending.length) {
    const index = pending.shift();
    connected.push(index);
    const row = Math.floor(index / size);
    const col = index % size;
    for (const [rowDelta, colDelta] of CARDINAL_STEPS) {
      const nextRow = row + rowDelta;
      const nextCol = col + colDelta;
      if (nextRow < 0 || nextRow >= size || nextCol < 0 || nextCol >= size) continue;
      const nextIndex = nextRow * size + nextCol;
      if (seen.has(nextIndex) || colors[nextIndex] !== color || !allowed.has(states[nextIndex])) continue;
      seen.add(nextIndex);
      pending.push(nextIndex);
    }
  }
  return connected;
}
