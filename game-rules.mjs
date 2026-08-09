const CARDINAL_STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

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
