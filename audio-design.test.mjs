import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';


const source = await readFile(new URL('./game.js', import.meta.url), 'utf8');


test('music leaves the low-frequency impact range to character movement', () => {
  assert.match(source, /const MUSIC_TEMPO = 118;/);
  assert.match(source, /musicFilter\.frequency\.value = 210;/);
  assert.doesNotMatch(source, /function musicKick/);
  assert.doesNotMatch(source, /musicKick\(/);
});


test('held movement uses one legato bounce instead of stacked land and jump sounds', () => {
  assert.match(source, /landOn\(hop\.target, Boolean\(queuedMove\)\)/);
  assert.match(source, /requestMove\(\.\.\.queuedMove, false, true\)/);
  assert.match(source, /sfx\(chained \? 'bounce' : 'land'/);
});


test('game outcomes have distinct audio feedback', () => {
  for (const cue of ['ready', 'levelClear', 'fall', 'lifeLost', 'countdown', 'timeout', 'gameOver', 'fullClear']) {
    assert.match(source, new RegExp(`name === '${cue}'`));
  }
  assert.match(source, /finish\(false, '时间到了', 'timeout'\)/);
  assert.match(source, /sfx\(win \? 'fullClear' : outcome\)/);
});

test('replacement tiles use a rising growth cue', () => {
  assert.match(source, /name === 'grow'/);
  assert.match(source, /voice\(\{ from: 230, peak: 340, to: note/);
  assert.doesNotMatch(source, /name === 'drop'/);
});
