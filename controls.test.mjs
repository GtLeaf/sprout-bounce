import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';


const [html, script, styles] = await Promise.all([
  readFile(new URL('./index.html', import.meta.url), 'utf8'),
  readFile(new URL('./game.js', import.meta.url), 'utf8'),
  readFile(new URL('./style.css', import.meta.url), 'utf8')
]);


test('mobile controls use gestures without a permanent direction pad', () => {
  assert.match(html, /id="swipePad"/);
  assert.doesNotMatch(html, /movePad|move-key|data-direction=/);
  assert.doesNotMatch(styles, /\.move-pad|\.move-key/);
});


test('holding a swipe continues movement in the same direction', () => {
  assert.match(script, /pointerStart\?\.move && now >= pointerStart\.nextMoveAt/);
  assert.match(script, /const HELD_MOVE_INTERVAL = 235/);
  assert.match(script, /pointerStart\.nextMoveAt = now \+ HELD_MOVE_INTERVAL/);
});


test('single hops use the faster movement timing', () => {
  assert.match(script, /const HOP_DURATION = 0\.25/);
  assert.match(script, /duration: HOP_DURATION/);
});


test('board restores green support blocks beneath individual tiles', () => {
  assert.match(script, /const baseGroup = new THREE\.Group\(\)/);
  assert.match(script, /const baseGeometry = new RoundedBoxGeometry\(SIZE - 0\.08, 0\.14, SIZE - 0\.08, 1, 0\.07\)/);
  assert.match(script, /lowPolyMaterial\(0x27695e\)[\s\S]*?lowPolyMaterial\(0x317765\)/);
});

test('sound control matches the adjacent queue panel at mobile sizes', () => {
  assert.match(styles, /@media \(max-width: 600px\) \{[\s\S]*?\.next-panel \{ width: 76px; height: 42px;[\s\S]*?\.icon-button \{ width: 42px; height: 42px; \}/);
  assert.match(styles, /@media \(max-width: 380px\) \{[\s\S]*?\.next-panel \{ width: 66px;[\s\S]*?\.icon-button \{ width: 42px; height: 42px; \}/);
});

test('camera uses a centered, rotated board view', () => {
  assert.match(script, /new THREE\.Vector3\(0\.4, 1\.55, 1\.09\)/);
  assert.match(script, /18 \/ Math\.min\(camera\.aspect, 1\)/);
  assert.doesNotMatch(script, /new THREE\.Vector3\(0\.82, 1\.55, 0\.82\)/);
  assert.doesNotMatch(script, /camera\.aspect < 0\.65\s*\? 39/);
});
