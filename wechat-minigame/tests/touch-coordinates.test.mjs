import assert from 'node:assert/strict';
import test from 'node:test';
import { touchPoint, touchPoints } from '../src/touch-coordinates.mjs';

const metrics = {
  width: 390,
  height: 844,
  renderRatio: 1.5,
  devicePixelRatio: 3,
  screenTop: 47
};

test('keeps standard WeChat logical touch coordinates unchanged', () => {
  assert.deepEqual(touchPoint({ clientX: 195, clientY: 745 }, metrics), {
    x: 195, y: 745, source: 'client', scale: 1, offsetY: 0
  });
});

test('normalizes render-buffer touch coordinates on iPhone', () => {
  assert.deepEqual(touchPoint({ clientX: 292.5, clientY: 1117.5 }, metrics), {
    x: 195, y: 745, source: 'client', scale: 1.5, offsetY: 0
  });
});

test('normalizes physical-pixel touch coordinates using the uncapped device ratio', () => {
  assert.deepEqual(touchPoint({ clientX: 585, clientY: 2235 }, metrics), {
    x: 195, y: 745, source: 'client', scale: 3, offsetY: 0
  });
});

test('supports iOS screen coordinates that include the top inset', () => {
  assert.deepEqual(touchPoint({ screenX: 195, screenY: 792 }, metrics), {
    x: 195, y: 745, source: 'screen', scale: 1, offsetY: 47
  });
});

test('retains multiple valid interpretations so UI hit testing can select its button', () => {
  const points = touchPoints({ clientX: 195, clientY: 745, screenX: 195, screenY: 792 }, metrics);
  assert.ok(points.some((point) => point.x === 195 && point.y === 745));
  assert.ok(points.every((point) => point.x >= -4 && point.x <= 394 && point.y >= -4 && point.y <= 848));
});
