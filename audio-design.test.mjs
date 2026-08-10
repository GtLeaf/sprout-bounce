import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';


const source = await readFile(new URL('./game.js', import.meta.url), 'utf8');


test('music is a beatless sampled bed with a slow-attack fallback', async () => {
  assert.match(source, /bgm: 'assets\/audio\/mix-v83\/happyjump-bgm-airy-loop\.wav'/);
  assert.match(source, /musicFilter\.frequency\.value = 210;/);
  assert.match(source, /document\.documentElement\.dataset\.musicPulse = 'none';/);
  assert.match(source, /if \(state\.musicSource \|\| state\.mixAudioStatus !== 'fallback'\)/);
  assert.match(source, /if \(step % 8 !== 0\) return;/);
  assert.match(source, /attack: 0\.65/);
  assert.match(source, /attack: 0\.85/);
  assert.doesNotMatch(source, /function musicKick/);
  assert.doesNotMatch(source, /function musicPluck/);
  assert.doesNotMatch(source, /function musicAir/);

  const info = await stat(new URL('./assets/audio/mix-v83/happyjump-bgm-airy-loop.wav', import.meta.url));
  assert.equal(info.size, 2822444, 'processed BGM should be a 16 second stereo PCM WAV');
});


test('held movement uses one legato bounce instead of stacked land and jump sounds', () => {
  assert.match(source, /landOn\(hop\.target, Boolean\(queuedMove\)\)/);
  assert.match(source, /requestMove\(\.\.\.queuedMove, false, true\)/);
  assert.match(source, /sfx\(chained \? 'bounce' : 'land'/);
});


test('each hop advances the twelve-character apple lyric, including held movement', async () => {
  assert.match(source, /const JUMP_LYRIC_TEXT = \['我', '是', '一', '颗', '小', '苹', '果', '就', '爱', '跳', '跳', '乐'\];/);
  assert.match(source, /const JUMP_LYRIC_RESET_GAP = 900;/);
  assert.match(source, /if \(now - state\.jumpLyricLastAt > JUMP_LYRIC_RESET_GAP\) state\.jumpLyricIndex = 0;/);
  assert.match(source, /if \(!playJumpLyric\(\)\) \{/);
  assert.match(source, /if \(!playJumpLyric\(\)\) voice\(\{ from: note/);
  assert.match(source, /state\.jumpLyricIndex = \(index \+ 1\) % JUMP_LYRIC_TEXT\.length;/);

  const lyricFiles = [
    '01-wo.wav', '02-shi.wav', '03-yi.wav', '04-ke.wav', '05-xiao.wav', '06-ping.wav',
    '07-guo.wav', '08-jiu.wav', '09-ai.wav', '10-tiao.wav', '11-tiao.wav', '12-le.wav'
  ];
  for (const file of lyricFiles) {
    const info = await stat(new URL(`./assets/audio/jump-lyrics/${file}`, import.meta.url));
    assert.equal(info.size, 22094, `${file} should be a 250 ms PCM WAV`);
  }
});


test('jump lyric has its own mix bus and ducks the background music', () => {
  assert.match(source, /const JUMP_LYRIC_BUS_GAIN = 0\.7;/);
  assert.match(source, /state\.lyricBus\.gain\.value = JUMP_LYRIC_BUS_GAIN;/);
  assert.match(source, /source\.connect\(state\.lyricBus\);/);
  assert.match(source, /duckMusic\(0\.42, 0\.28\);/);
  assert.match(source, /console\.warn\('Jump lyric audio could not be loaded; using synthesized bounce sounds\.'/);
});


test('game outcomes have distinct audio feedback', () => {
  for (const cue of ['ready', 'levelClear', 'fall', 'lifeLost', 'countdown', 'timeout', 'gameOver', 'fullClear']) {
    assert.match(source, new RegExp(`name === '${cue}'`));
  }
  assert.match(source, /finish\(false, '时间到了', 'timeout'\)/);
  assert.match(source, /sfx\(win \? 'fullClear' : outcome\)/);
});

test('success and failure outcomes prefer generated samples with synthesized fallbacks', async () => {
  const cues = ['levelClear', 'fullClear', 'lifeLost', 'gameOver', 'timeout'];
  for (const cue of cues) {
    assert.match(source, new RegExp(`playMixCue\\('${cue}'`));
    const file = cue.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    const info = await stat(new URL(`./assets/audio/mix-v83/happyjump-${file}.wav`, import.meta.url));
    assert.ok(info.size > 44, `${cue} should include playable PCM data`);
  }
  assert.match(source, /state\.activeMixSources\.add\(source\)/);
  assert.match(source, /stopMixCues\(\);\s+stopMusic\(\);/);
});

test('replacement tiles use a rising growth cue', () => {
  assert.match(source, /name === 'grow'/);
  assert.match(source, /voice\(\{ from: 230, peak: 340, to: note/);
  assert.doesNotMatch(source, /name === 'drop'/);
});
