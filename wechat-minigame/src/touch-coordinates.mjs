function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function addCandidate(result, seen, x, y, source, scale, offsetY, width, height) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (x < -4 || y < -4 || x > width + 4 || y > height + 4) return;
  const key = `${Math.round(x * 10)}:${Math.round(y * 10)}`;
  if (seen.has(key)) return;
  seen.add(key);
  result.push({ x, y, source, scale, offsetY });
}

export function touchPoints(value, metrics) {
  if (!value) return [];
  const width = Math.max(1, Number(metrics?.width) || 1);
  const height = Math.max(1, Number(metrics?.height) || 1);
  const renderRatio = Math.max(1, Number(metrics?.renderRatio) || 1);
  const devicePixelRatio = Math.max(1, Number(metrics?.devicePixelRatio) || renderRatio);
  const screenTop = Math.max(0, Number(metrics?.screenTop) || 0);
  const scales = [...new Set([1, renderRatio, devicePixelRatio])];
  const sources = [
    ['client', 'clientX', 'clientY', false],
    ['page', 'pageX', 'pageY', false],
    ['xy', 'x', 'y', false],
    ['screen', 'screenX', 'screenY', true],
    ['raw', 'rawX', 'rawY', false]
  ];
  const result = [];
  const seen = new Set();

  for (const [source, xKey, yKey, screenCoordinates] of sources) {
    const rawX = finiteNumber(value[xKey]);
    const rawY = finiteNumber(value[yKey]);
    if (rawX === null || rawY === null) continue;
    for (const scale of scales) {
      const offsets = screenCoordinates && screenTop > 0
        ? [screenTop * scale, screenTop, 0]
        : [0];
      for (const offsetY of offsets) {
        addCandidate(result, seen, rawX / scale, (rawY - offsetY) / scale,
          source, scale, offsetY, width, height);
      }
    }
  }
  return result;
}

export function touchPoint(value, metrics) {
  return touchPoints(value, metrics)[0] || null;
}
