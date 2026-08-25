import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';


const source = await readFile(new URL('./game.js', import.meta.url), 'utf8');

async function readPcmWavInfo(url) {
  const data = await readFile(url);
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WAVE');
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= data.length;) {
    const chunk = data.toString('ascii', offset, offset + 4);
    const chunkBytes = data.readUInt32LE(offset + 4);
    if (chunk === 'fmt ') {
      assert.equal(data.readUInt16LE(offset + 8), 1, 'audio must use PCM encoding');
      channels = data.readUInt16LE(offset + 10);
      sampleRate = data.readUInt32LE(offset + 12);
      bitsPerSample = data.readUInt16LE(offset + 22);
    } else if (chunk === 'data') {
      dataBytes = chunkBytes;
      break;
    }
    offset += 8 + chunkBytes + (chunkBytes % 2);
  }
  assert.ok(channels && sampleRate && bitsPerSample && dataBytes, 'WAV must contain fmt and data chunks');
  return {
    channels,
    sampleRate,
    bitsPerSample,
    duration: dataBytes / (sampleRate * channels * bitsPerSample / 8)
  };
}


test('party BGM stays lively without overpowering the hop feedback', async () => {
  assert.match(source, /bgm: 'assets\/audio\/mix-v91\/happyjump-bgm-bouncy-party-v91\.wav'/);
  assert.match(source, /const MUSIC_BUS_GAIN = 0\.28;/);
  assert.match(source, /musicFilter\.frequency\.value = 120;/);
  assert.match(source, /dataset\.musicStyle = 'bouncy-party-loop';/);
  assert.match(source, /dataset\.musicPalette = 'warm-marimba-toy-piano-soft-drum-shaker';/);
  assert.match(source, /document\.documentElement\.dataset\.musicPulse = '128bpm-eighth-note';/);
  assert.match(source, /if \(state\.musicSource \|\| state\.mixAudioStatus !== 'fallback'\)/);
  assert.match(source, /if \(step % 8 !== 0\) return;/);
  assert.match(source, /attack: 0\.65/);
  assert.match(source, /attack: 0\.85/);
  assert.doesNotMatch(source, /function musicKick/);
  assert.doesNotMatch(source, /function musicPluck/);
  assert.doesNotMatch(source, /function musicAir/);

  const info = await stat(new URL('./assets/audio/mix-v91/happyjump-bgm-bouncy-party-v91.wav', import.meta.url));
  assert.ok(info.size > 2_300_000, 'party BGM should include the complete loop');
  const wav = await readPcmWavInfo(new URL('./assets/audio/mix-v91/happyjump-bgm-bouncy-party-v91.wav', import.meta.url));
  assert.deepEqual({ channels: wav.channels, sampleRate: wav.sampleRate, bitsPerSample: wav.bitsPerSample }, { channels: 2, sampleRate: 44100, bitsPerSample: 16 });
  assert.ok(Math.abs(wav.duration - 16) < 0.002, 'BGM should be a full 16-second loop');
});


test('held movement uses one hop beat instead of stacked land and jump sounds', () => {
  assert.match(source, /landOn\(hop\.target, Boolean\(queuedMove\)\)/);
  assert.match(source, /requestMove\(\.\.\.queuedMove, false, true\)/);
  assert.match(source, /sfx\(chained \? 'bounce' : 'land'/);
});


test('each jump and chained bounce use the same short hop beat instead of sliced vocals', async () => {
  assert.match(source, /hopBeat: 'assets\/audio\/mix-v92\/happyjump-hop-soft-pop-v92\.wav'/);
  assert.match(source, /MIX_CUE_GAINS = Object\.freeze\(\{ hopBeat: 0\.38,/);
  assert.match(source, /function playHopBeat\(\) \{[\s\S]*?playMixCue\('hopBeat'\)/);
  assert.match(source, /if \(name === 'jump'\) \{\s+playHopBeat\(\);\s+\} else if \(name === 'bounce'\) \{\s+playHopBeat\(\);/);
  assert.doesNotMatch(source, /playJumpLyric|resetJumpLyric|JUMP_LYRIC|jumpLyricBuffer|lyricBus/i);

  const wav = await readPcmWavInfo(new URL('./assets/audio/mix-v92/happyjump-hop-soft-pop-v92.wav', import.meta.url));
  assert.deepEqual({ channels: wav.channels, sampleRate: wav.sampleRate, bitsPerSample: wav.bitsPerSample }, { channels: 1, sampleRate: 48000, bitsPerSample: 16 });
  assert.ok(wav.duration <= 0.16, 'soft hop pop should stay short enough for rapid repeats');
});


test('movement cadence follows 128 BPM eighth notes without delaying the first input', () => {
  assert.match(source, /const RHYTHM_BPM = 128;/);
  assert.match(source, /const RHYTHM_BEAT_SECONDS = 60 \/ RHYTHM_BPM \/ 2;/);
  assert.match(source, /const HOP_DURATION = RHYTHM_BEAT_SECONDS;/);
  assert.match(source, /const HELD_MOVE_INTERVAL = Math\.round\(RHYTHM_BEAT_SECONDS \* 1000\);/);
  assert.match(source, /document\.documentElement\.dataset\.musicTempo = String\(RHYTHM_BPM\);/);
  assert.match(source, /const accepted = hopTo\(rowDelta, colDelta, silentStart\);/);
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
    levelClear: [1.1, 1.2],
    fullClear: [1.65, 1.75],
    lifeLost: [0.8, 0.9],
    gameOver: [1.3, 1.4],
    timeout: [0.78, 0.86]
  };
  for (const cue of cues) {
    assert.match(source, new RegExp(`playMixCue\\('${cue}'`));
    const file = cue.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    const suffix = `-party-v91`;
    const info = await stat(new URL(`./assets/audio/mix-v91/happyjump-${file}${suffix}.wav`, import.meta.url));
    assert.ok(info.size > 44, `${cue} should include playable PCM data`);
    const wav = await readPcmWavInfo(new URL(`./assets/audio/mix-v91/happyjump-${file}${suffix}.wav`, import.meta.url));
    assert.equal(wav.channels, 1, `${cue} should be mono so it stays centered on mobile speakers`);
    assert.equal(wav.sampleRate, 48000);
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
