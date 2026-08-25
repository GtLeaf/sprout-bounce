import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const downloads = 'C:/Users/happyelements/Downloads';
const outputDir = new URL('../assets/audio/mix-v89/', import.meta.url);

const sources = {
  hopBeat: 'aivoice-agent_xuanhui.wen_xuanhui.wen_20260812031055_799d4077_assistant_t2a_1786504385_76eecc_3.wav',
  levelClear: 'aivoice-agent_xuanhui.wen_xuanhui.wen_20260812031055_799d4077_assistant_t2a_1786504392_4a55c0_1.wav',
  fullClear: 'aivoice-agent_xuanhui.wen_xuanhui.wen_20260812031055_799d4077_assistant_t2a_1786504399_4f6481_0.wav',
  lifeLost: 'aivoice-agent_xuanhui.wen_xuanhui.wen_20260812031055_799d4077_assistant_t2a_1786504406_d2a2a3_1.wav',
  gameOver: 'aivoice-agent_xuanhui.wen_xuanhui.wen_20260812031055_799d4077_assistant_t2a_1786505023_40dbec_3.wav',
  timeout: 'aivoice-agent_xuanhui.wen_xuanhui.wen_20260812031055_799d4077_assistant_t2a_1786505100_f57b0b_1.wav'
};

const targets = {
  hopBeat: ['happyjump-hop-beat-cute-v89.wav', 0.18],
  levelClear: ['happyjump-level-clear-cute-v89.wav', 1.10],
  fullClear: ['happyjump-full-clear-cute-v89.wav', 1.60],
  lifeLost: ['happyjump-life-lost-cute-v89.wav', 0.85],
  gameOver: ['happyjump-game-over-cute-v89.wav', 1.35],
  timeout: ['happyjump-timeout-cute-v89.wav', 0.82]
};

function parseFloatWav(data) {
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Input is not a WAV file');
  }
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataStart = 0;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= data.length;) {
    const id = data.toString('ascii', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      channels = data.readUInt16LE(offset + 10);
      sampleRate = data.readUInt32LE(offset + 12);
      bitsPerSample = data.readUInt16LE(offset + 22);
    } else if (id === 'data') {
      dataStart = offset + 8;
      dataBytes = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (channels !== 1 || bitsPerSample !== 32 || !sampleRate || !dataStart) {
    throw new Error(`Expected mono float WAV, got ${channels}ch ${bitsPerSample}bit`);
  }
  const sampleCount = Math.floor(dataBytes / 4);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) samples[i] = data.readFloatLE(dataStart + i * 4);
  return { sampleRate, samples };
}

function encodePcm16(samples, sampleRate) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return buffer;
}

function trimAndShape(samples, sampleRate, duration) {
  const threshold = 0.0025;
  let start = 0;
  while (start < samples.length && Math.abs(samples[start]) < threshold) start += 1;
  const count = Math.floor(duration * sampleRate);
  const shaped = new Float32Array(count);
  shaped.set(samples.subarray(start, start + count));

  let peak = 0;
  for (const sample of shaped) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0.0001) {
    const gain = Math.min(0.72 / peak, 2.2);
    for (let i = 0; i < shaped.length; i += 1) shaped[i] *= gain;
  }

  const fadeIn = Math.min(Math.floor(sampleRate * 0.004), shaped.length);
  const fadeOut = Math.min(Math.floor(sampleRate * 0.035), shaped.length);
  for (let i = 0; i < fadeIn; i += 1) shaped[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i += 1) {
    const index = shaped.length - fadeOut + i;
    shaped[index] *= 1 - i / fadeOut;
  }
  return shaped;
}

await mkdir(outputDir, { recursive: true });
for (const [cue, sourceName] of Object.entries(sources)) {
  const source = parseFloatWav(await readFile(join(downloads, sourceName)));
  const [fileName, duration] = targets[cue];
  const shaped = trimAndShape(source.samples, source.sampleRate, duration);
  await writeFile(new URL(fileName, outputDir), encodePcm16(shaped, source.sampleRate));
  console.log(`${fileName}: ${(shaped.length / source.sampleRate).toFixed(3)}s`);
}
