import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';


const [html, script, styles] = await Promise.all([
  readFile(new URL('./index.html', import.meta.url), 'utf8'),
  readFile(new URL('./game.js', import.meta.url), 'utf8'),
  readFile(new URL('./style.css', import.meta.url), 'utf8')
]);


test('mobile controls expose four separate direction buttons', () => {
  for (const direction of ['up', 'down', 'left', 'right']) {
    assert.match(html, new RegExp(`data-direction="${direction}"`));
  }
  assert.doesNotMatch(html, /moveStick|move-stick-knob/);
});


test('direction buttons preserve a 44px touch target on narrow screens', () => {
  assert.match(styles, /\.move-key \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
  assert.doesNotMatch(styles, /\.move-key \{ width: 42px/);
});


test('leaving a held button stops movement instead of changing direction', () => {
  assert.match(script, /if \(!inside\) releaseMoveKey\(event\);/);
  assert.match(script, /controlHold = \{ id: event\.pointerId, move, button, nextMoveAt:/);
  assert.doesNotMatch(script, /distance < 13/);
});

test('sound control matches the adjacent queue panel at mobile sizes', () => {
  assert.match(styles, /@media \(max-width: 600px\) \{[\s\S]*?\.next-panel \{ width: 76px; height: 42px;[\s\S]*?\.icon-button \{ width: 42px; height: 42px; \}/);
  assert.match(styles, /@media \(max-width: 380px\) \{[\s\S]*?\.next-panel \{ width: 66px;[\s\S]*?\.icon-button \{ width: 42px; height: 42px; \}/);
});

test('camera uses a centered, slightly steeper board view', () => {
  assert.match(script, /new THREE\.Vector3\(0\.82, 1\.02, 0\.82\)/);
  assert.doesNotMatch(script, /new THREE\.Vector3\(0\.72, 0\.82, 0\.9\)/);
});
