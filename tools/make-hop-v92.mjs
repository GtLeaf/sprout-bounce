import { mkdir, writeFile } from 'node:fs/promises';

const sampleRate = 48000;
const duration = 0.14;
const frames = Math.floor(sampleRate * duration);
const samples = new Float32Array(frames);
let phase = 0;

for (let i = 0; i < frames; i += 1) {
  const t = i / sampleRate;
  const attack = Math.min(1, t / 0.008);
  const body = Math.exp(-t / 0.058);
  const bubble = t > 0.028 ? Math.exp(-(t - 0.028) / 0.032) : 0;
  const frequency = 172 + 92 * (1 - Math.exp(-t / 0.032));
  phase += (Math.PI * 2 * frequency) / sampleRate;
  const warmBody = Math.sin(phase) * 0.76 + Math.sin(phase * 2) * 0.12;
  const softPop = Math.sin(phase * 0.5) * 0.11;
  const bubbleTone = Math.sin(phase * 2.55) * bubble * 0.08;
  const fade = i > frames - Math.floor(sampleRate * 0.035)
    ? (frames - i) / Math.floor(sampleRate * 0.035)
    : 1;
  samples[i] = (warmBody * body + softPop * body + bubbleTone) * attack * fade;
}

let peak = 0;
for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
const gain = 0.32 / peak;
for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;

const dataBytes = samples.length * 2;
const wav = Buffer.alloc(44 + dataBytes);
wav.write('RIFF', 0, 'ascii');
wav.writeUInt32LE(36 + dataBytes, 4);
wav.write('WAVE', 8, 'ascii');
wav.write('fmt ', 12, 'ascii');
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36, 'ascii');
wav.writeUInt32LE(dataBytes, 40);
for (let i = 0; i < samples.length; i += 1) wav.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);

const outputDir = new URL('../assets/audio/mix-v92/', import.meta.url);
await mkdir(outputDir, { recursive: true });
await writeFile(new URL('happyjump-hop-soft-pop-v92.wav', outputDir), wav);
console.log(`happyjump-hop-soft-pop-v92.wav: ${(samples.length / sampleRate).toFixed(3)}s, peak ${(0.32).toFixed(3)}`);
