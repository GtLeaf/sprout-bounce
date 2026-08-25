import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const downloads = 'C:/Users/happyelements/Downloads';
const outputDir = new URL('../assets/audio/mix-v91/', import.meta.url);

const sources = {
  bgm: 'aivoice-agent_xuanhui.wen_xuanhui.wen_20260813054808_c3ce49a5_assistant_music_warm_mellow_softened_loop.wav',
  hopBeat: 'aivoice-agent_xuanhui.wen_xuanhui.wen_20260813054808_c3ce49a5_assistant_hop_trimmed.wav',
  levelClear: 'aivoice-agent_xuanhui.wen_xuanhui.wen_20260813054808_c3ce49a5_assistant_t2a_1786600216_7aa4dd_0.wav',
  fullClear: 'aivoice-agent_xuanhui.wen_xuanhui.wen_20260813054808_c3ce49a5_assistant_t2a_1786600224_37a290_0.wav',
  lifeLost: 'aivoice-agent_xuanhui.wen_xuanhui.wen_20260813054808_c3ce49a5_assistant_lifelost_trimmed.wav',
  gameOver: 'aivoice-agent_xuanhui.wen_xuanhui.wen_20260813054808_c3ce49a5_assistant_t2a_1786600239_4c28ea_0.wav',
  timeout: 'aivoice-agent_xuanhui.wen_xuanhui.wen_20260813054808_c3ce49a5_assistant_timeout_trimmed.wav'
};

const targets = {
  hopBeat: ['happyjump-hop-bouncy-joy-v91.wav', 0.15],
  levelClear: ['happyjump-level-clear-party-v91.wav', 1.15],
  fullClear: ['happyjump-full-clear-party-v91.wav', 1.70],
  lifeLost: ['happyjump-life-lost-party-v91.wav', 0.85],
  gameOver: ['happyjump-game-over-party-v91.wav', 1.35],
  timeout: ['happyjump-timeout-party-v91.wav', 0.85]
};

function parseWav(data) {
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Input is not a RIFF/WAVE file');
  }
  let format = 0;
  let subFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataStart = 0;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= data.length;) {
    const id = data.toString('ascii', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      format = data.readUInt16LE(offset + 8);
      channels = data.readUInt16LE(offset + 10);
      sampleRate = data.readUInt32LE(offset + 12);
      bitsPerSample = data.readUInt16LE(offset + 22);
      if (format === 65534 && size >= 40) subFormat = data.readUInt32LE(offset + 24);
    } else if (id === 'data') {
      dataStart = offset + 8;
      dataBytes = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!channels || !sampleRate || !bitsPerSample || !dataStart) throw new Error('WAV is missing fmt/data chunks');
  const isFloat = format === 3 || (format === 65534 && subFormat === 3);
  const bytesPerSample = bitsPerSample / 8;
  const frameBytes = channels * bytesPerSample;
  const frames = Math.floor(dataBytes / frameBytes);
  const samples = new Float32Array(frames * channels);
  for (let i = 0; i < samples.length; i += 1) {
    const at = dataStart + i * bytesPerSample;
    let value;
    if (isFloat && bitsPerSample === 32) value = data.readFloatLE(at);
    else if (bitsPerSample === 8) value = (data.readUInt8(at) - 128) / 128;
    else if (bitsPerSample === 16) value = data.readInt16LE(at) / 32768;
    else if (bitsPerSample === 24) value = data.readIntLE(at, 3) / 8388608;
    else if (bitsPerSample === 32) value = data.readInt32LE(at) / 2147483648;
    else throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`);
    samples[i] = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  }
  return { channels, sampleRate, samples };
}

function downmix(samples, channels) {
  if (channels === 1) return samples;
  const frames = Math.floor(samples.length / channels);
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) sum += samples[frame * channels + channel];
    mono[frame] = sum / channels;
  }
  return mono;
}

function lowPass(samples, channels, sampleRate, cutoff) {
  const alpha = Math.exp(-2 * Math.PI * cutoff / sampleRate);
  const state = new Float32Array(channels);
  for (let i = 0; i < samples.length; i += 1) {
    const channel = i % channels;
    state[channel] = (1 - alpha) * samples[i] + alpha * state[channel];
    samples[i] = state[channel];
  }
  return samples;
}

function peakOf(samples) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

function normalize(samples, targetPeak) {
  const peak = peakOf(samples);
  if (peak > 0.0001) {
    const gain = Math.min(targetPeak / peak, 1.6);
    for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
  }
}

function shapeSfx(samples, sampleRate, duration) {
  const threshold = 0.002;
  let start = 0;
  while (start < samples.length && Math.abs(samples[start]) < threshold) start += 1;
  const count = Math.max(1, Math.floor(duration * sampleRate));
  const shaped = new Float32Array(count);
  shaped.set(samples.subarray(start, start + count));
  lowPass(shaped, 1, sampleRate, 7800);
  normalize(shaped, 0.5);
  const fadeIn = Math.min(Math.floor(sampleRate * 0.006), shaped.length);
  const fadeOut = Math.min(Math.floor(sampleRate * 0.045), shaped.length);
  for (let i = 0; i < fadeIn; i += 1) shaped[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i += 1) {
    const index = shaped.length - fadeOut + i;
    shaped[index] *= 1 - i / fadeOut;
  }
  return shaped;
}

function makeLoop(samples, channels, sampleRate, seconds) {
  const frames = Math.floor(seconds * sampleRate);
  const loop = new Float32Array(frames * channels);
  loop.set(samples.subarray(0, loop.length));
  lowPass(loop, channels, sampleRate, 10500);
  normalize(loop, 0.48);
  const crossfade = Math.min(Math.floor(sampleRate * 0.08), Math.floor(frames / 3));
  for (let frame = 0; frame < crossfade; frame += 1) {
    const t = frame / crossfade;
    for (let channel = 0; channel < channels; channel += 1) {
      const end = (frames - crossfade + frame) * channels + channel;
      const start = frame * channels + channel;
      loop[end] = loop[end] * (1 - t) + loop[start] * t;
    }
  }
  return loop;
}

function encodePcm16(samples, sampleRate, channels) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return buffer;
}

await mkdir(outputDir, { recursive: true });
const bgm = parseWav(await readFile(join(downloads, sources.bgm)));
const bgmLoop = makeLoop(bgm.samples, Math.min(bgm.channels, 2), bgm.sampleRate, 16);
await writeFile(new URL('happyjump-bgm-bouncy-party-v91.wav', outputDir), encodePcm16(bgmLoop, bgm.sampleRate, Math.min(bgm.channels, 2)));
console.log(`happyjump-bgm-bouncy-party-v91.wav: ${(bgmLoop.length / Math.min(bgm.channels, 2) / bgm.sampleRate).toFixed(3)}s`);

for (const [cue, sourceName] of Object.entries(sources)) {
  if (cue === 'bgm') continue;
  const source = parseWav(await readFile(join(downloads, sourceName)));
  const [fileName, duration] = targets[cue];
  const mono = downmix(source.samples, source.channels);
  const shaped = shapeSfx(mono, source.sampleRate, duration);
  await writeFile(new URL(fileName, outputDir), encodePcm16(shaped, source.sampleRate, 1));
  console.log(`${fileName}: ${(shaped.length / source.sampleRate).toFixed(3)}s`);
}
