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
