import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';


const source = await readFile(new URL('./game.js', import.meta.url), 'utf8');

async function readPcmWavInfo(url) {
  const data = await readFile(url);
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WAVE');
  const channels = data.readUInt16LE(22);
  const sampleRate = data.readUInt32LE(24);
  const bitsPerSample = data.readUInt16LE(34);
  const dataBytes = data.readUInt32LE(40);
  return {
    channels,
    sampleRate,
    bitsPerSample,
    duration: dataBytes / (sampleRate * channels * bitsPerSample / 8)
  };
}


test('music is a cute toy-instrument bed that leaves the jump lyric in front', async () => {
  assert.match(source, /bgm: 'assets\/audio\/mix-v84\/happyjump-bgm-cute-toy-loop\.wav'/);
  assert.match(source, /const MUSIC_BUS_GAIN = 0\.3;/);
  assert.match(source, /musicFilter\.frequency\.value = 145;/);
  assert.match(source, /dataset\.musicStyle = 'cute-toy-lyric-safe-sample';/);
  assert.match(source, /dataset\.musicPalette = 'toy-piano-marimba-kalimba';/);
  assert.match(source, /document\.documentElement\.dataset\.musicPulse = 'none';/);
  assert.match(source, /if \(state\.musicSource \|\| state\.mixAudioStatus !== 'fallback'\)/);
  assert.match(source, /if \(step % 8 !== 0\) return;/);
  assert.match(source, /attack: 0\.65/);
  assert.match(source, /attack: 0\.85/);
  assert.doesNotMatch(source, /function musicKick/);
  assert.doesNotMatch(source, /function musicPluck/);
  assert.doesNotMatch(source, /function musicAir/);

  const info = await stat(new URL('./assets/audio/mix-v84/happyjump-bgm-cute-toy-loop.wav', import.meta.url));
  assert.equal(info.size, 2822444, 'processed BGM should be a 16 second stereo PCM WAV');
  const wav = await readPcmWavInfo(new URL('./assets/audio/mix-v84/happyjump-bgm-cute-toy-loop.wav', import.meta.url));
  assert.deepEqual({ channels: wav.channels, sampleRate: wav.sampleRate, bitsPerSample: wav.bitsPerSample }, { channels: 2, sampleRate: 44100, bitsPerSample: 16 });
  assert.equal(wav.duration, 16);
});


test('held movement uses one legato bounce instead of stacked land and jump sounds', () => {
  assert.match(source, /landOn\(hop\.target, Boolean\(queuedMove\)\)/);
  assert.match(source, /requestMove\(\.\.\.queuedMove, false, true\)/);
  assert.match(source, /sfx\(chained \? 'bounce' : 'land'/);
});


test('each hop advances the fourteen-character continuous apple lyric', async () => {
  assert.match(source, /const JUMP_LYRIC_FILE = 'assets\/audio\/jump-lyrics-v85\/happyjump-apple-continuous-master\.wav';/);
  assert.match(source, /const JUMP_LYRIC_TEXT = \['我', '是', '一', '个', '小', '苹', '果', '每', '天', '就', '爱', '跳', '跳', '乐'\];/);
  assert.match(source, /const JUMP_LYRIC_RESET_GAP = 900;/);
  assert.match(source, /const JUMP_LYRIC_TRIGGER_INTERVAL = HELD_MOVE_INTERVAL \/ 1000;/);
  assert.match(source, /if \(elapsed > JUMP_LYRIC_RESET_GAP\) \{/);
  assert.match(source, /if \(!playJumpLyric\(\)\) \{/);
  assert.match(source, /if \(!playJumpLyric\(\)\) voice\(\{ from: note/);
  assert.match(source, /state\.jumpLyricIndex = \(index \+ 1\) % JUMP_LYRIC_TEXT\.length;/);

  const wav = await readPcmWavInfo(new URL('./assets/audio/jump-lyrics-v85/happyjump-apple-continuous-master.wav', import.meta.url));
  assert.deepEqual({ channels: wav.channels, sampleRate: wav.sampleRate, bitsPerSample: wav.bitsPerSample }, { channels: 1, sampleRate: 44100, bitsPerSample: 16 });
  assert.ok(wav.duration >= 3 && wav.duration <= 3.1, 'continuous lyric master should contain one compact full phrase');
});


test('jump lyric crossfades adjacent slices instead of cutting off the previous syllable', () => {
  assert.match(source, /const JUMP_LYRIC_BUS_GAIN = 0\.7;/);
  assert.match(source, /const JUMP_LYRIC_CROSSFADE = 0\.045;/);
  assert.match(source, /const JUMP_LYRIC_LEGATO_GAP = 0\.52;/);
  assert.match(source, /state\.lyricBus\.gain\.value = JUMP_LYRIC_BUS_GAIN;/);
  assert.match(source, /const sourceSlot = buffer\.duration \/ JUMP_LYRIC_TEXT\.length;/);
  assert.match(source, /dataset\.jumpLyricLegato = String\(legato\);/);
  assert.match(source, /const overlapProgress = legato/);
  assert.match(source, /JUMP_LYRIC_CROSSFADE \* \(1 - overlapProgress\)/);
  assert.match(source, /source\.connect\(gain\)\.connect\(state\.lyricBus\);/);
  assert.match(source, /gain\.gain\.linearRampToValueAtTime\(1, start \+ fadeIn\);/);
  assert.match(source, /gain\.gain\.linearRampToValueAtTime\(0\.0001, start \+ duration\);/);
  assert.match(source, /state\.activeJumpLyricSources\.add\(entry\);/);
  assert.match(source, /source\.start\(start, offset, duration\);/);
  assert.doesNotMatch(source, /activeJumpLyricSource: null/);
  assert.match(source, /duckMusic\(0\.34, 0\.3\);/);
  assert.match(source, /console\.warn\('Continuous jump lyric master could not be loaded; using synthesized bounce sounds\.'/);
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
  const durationRanges = {
    levelClear: [1.2, 1.3],
    fullClear: [1.2, 1.35],
    lifeLost: [0.9, 1],
    gameOver: [1.4, 1.5],
    timeout: [0.8, 0.9]
  };
  for (const cue of cues) {
    assert.match(source, new RegExp(`playMixCue\\('${cue}'`));
    const file = cue.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    const info = await stat(new URL(`./assets/audio/mix-v84/happyjump-${file}.wav`, import.meta.url));
    assert.ok(info.size > 44, `${cue} should include playable PCM data`);
    const wav = await readPcmWavInfo(new URL(`./assets/audio/mix-v84/happyjump-${file}.wav`, import.meta.url));
    assert.equal(wav.channels, 1, `${cue} should be mono so it stays centered on mobile speakers`);
    assert.equal(wav.sampleRate, 44100);
    assert.equal(wav.bitsPerSample, 16);
    assert.ok(wav.duration >= durationRanges[cue][0] && wav.duration <= durationRanges[cue][1], `${cue} should stay concise`);
  }
  assert.match(source, /state\.activeMixSources\.add\(source\)/);
  assert.match(source, /stopMixCues\(\);\s+stopMusic\(\);/);
});

test('replacement tiles use a rising growth cue', () => {
  assert.match(source, /name === 'grow'/);
  assert.match(source, /voice\(\{ from: 230, peak: 340, to: note/);
  assert.doesNotMatch(source, /name === 'drop'/);
});
