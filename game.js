import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EXPLOSION_TIMING, LEVELS, TILE_COLORS } from './game-config.mjs?v=69';
import { orthogonalComponent } from './game-rules.mjs?v=65';

const $ = (selector) => document.querySelector(selector);
const QA_MODE = new URLSearchParams(location.search).has('qa');

const ui = {
  intro: $('#intro'), result: $('#result'), level: $('#level'), score: $('#score'),
  timer: $('#timer'), combo: $('#combo'), goal: $('#goal'), lives: $('#lives'),
  next: $('#next'), toast: $('#toast')
};

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x5adbe4, 34, 58);

const camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x14245b, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
$('#game').appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x4e9f8a, 1.55));
const sun = new THREE.DirectionalLight(0xfff4cf, 2.15);
sun.position.set(-7, 16, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
scene.add(sun);

const BOARD = 7;
const SIZE = 1.45;
const GAP = 0.10;
const STEP = SIZE + GAP;
const PLAYER_BASE = 0.43;
const HOP_DURATION = 0.25;
const HELD_MOVE_INTERVAL = 235;
const COLOR_DEFS = TILE_COLORS;
const COLORS = COLOR_DEFS.map((item) => item.hex);
const MAX_LIVES = 3;

const lowPolyMaterial = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: 0.86,
  metalness: 0,
  flatShading: true,
  ...options
});

const boardSpan = BOARD * STEP - GAP;
const boardFrameGeometry = new RoundedBoxGeometry(boardSpan + 0.9, 0.62, boardSpan + 0.9, 1, 0.22);
const boardFrame = new THREE.Mesh(
  boardFrameGeometry,
  lowPolyMaterial(0xe0b75f)
);
boardFrame.position.y = -0.96;
boardFrame.receiveShadow = true;
scene.add(boardFrame);

const island = new THREE.Mesh(
  new THREE.CylinderGeometry(8.35, 5.65, 3.8, 4, 2, false),
  [
    lowPolyMaterial(0x6f8790),
    lowPolyMaterial(0x70c94b),
    lowPolyMaterial(0x496776)
  ]
);
island.position.y = -2.86;
island.rotation.y = Math.PI / 4;
island.receiveShadow = true;
island.castShadow = true;
scene.add(island);

const islandRim = new THREE.Mesh(
  new THREE.CylinderGeometry(8.43, 8.22, 0.34, 4, 1, false),
  lowPolyMaterial(0x75cf4e)
);
islandRim.position.y = -1.04;
islandRim.rotation.y = Math.PI / 4;
islandRim.receiveShadow = true;
scene.add(islandRim);

const baseGroup = new THREE.Group();
const baseGeometry = new RoundedBoxGeometry(SIZE - 0.08, 0.14, SIZE - 0.08, 1, 0.07);
const baseMaterials = [
  lowPolyMaterial(0x27695e),
  lowPolyMaterial(0x317765)
];
for (let row = 0; row < BOARD; row += 1) {
  for (let col = 0; col < BOARD; col += 1) {
    const base = new THREE.Mesh(baseGeometry, baseMaterials[(row + col) % 2]);
    base.position.set((col - 3) * STEP, -0.58, (row - 3) * STEP);
    base.receiveShadow = true;
    baseGroup.add(base);
  }
}
scene.add(baseGroup);

const tiles = [];
const tileMeshes = [];
const tileGeometry = new RoundedBoxGeometry(SIZE, 0.72, SIZE, 3, 0.23);
const topGeometry = new RoundedBoxGeometry(SIZE - 0.12, 0.1, SIZE - 0.12, 2, 0.16);
const tileHighlightGeometry = new RoundedBoxGeometry(0.36, 0.025, 0.075, 1, 0.025);
const tileHighlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.24, depthWrite: false });

function applyColor(tile, index) {
  const data = tile.userData;
  data.color = index;
  const baseColor = new THREE.Color(COLORS[index]);
  data.mainMat.color.copy(baseColor).offsetHSL(0, 0.025, -0.035);
  data.topMat.color.copy(baseColor).offsetHSL(0, 0.025, 0.028);
  data.mainMat.emissive.setHex(0x000000);
  data.topMat.emissive.setHex(0x000000);
  data.mainMat.emissiveIntensity = 0;
  data.topMat.emissiveIntensity = 0;
}

function makeTile(row, col) {
  const group = new THREE.Group();
  const mainMat = lowPolyMaterial(0xffffff, { emissive: 0x000000, emissiveIntensity: 0, roughness: 0.72 });
  const topMat = lowPolyMaterial(0xffffff, { emissive: 0x000000, emissiveIntensity: 0, roughness: 0.62 });
  const block = new THREE.Mesh(tileGeometry, mainMat);
  block.castShadow = true;
  block.receiveShadow = true;
  const top = new THREE.Mesh(topGeometry, topMat);
  top.position.y = 0.38;
  top.castShadow = true;
  const highlight = new THREE.Mesh(tileHighlightGeometry, tileHighlightMaterial);
  highlight.position.set(-0.24, 0.445, -0.34);
  highlight.rotation.y = -0.12;
  group.add(block, top, highlight);
  group.position.set((col - 3) * STEP, 0, (row - 3) * STEP);
  group.userData = {
    row, col, color: 0, state: 'solid', timer: 0, vy: 0, warningId: 0, chainDepth: 0,
    burstTotal: 0, burstIndex: 0, growTotal: 0, bounceAge: 0, bounceStrength: 0,
    mainMat, topMat, bonus: null
  };
  block.userData.tile = group;
  top.userData.tile = group;
  tileMeshes.push(block, top);
  scene.add(group);
  tiles.push(group);
  return group;
}

for (let row = 0; row < BOARD; row += 1) {
  for (let col = 0; col < BOARD; col += 1) makeTile(row, col);
}

function tileAt(row, col) {
  return row >= 0 && row < BOARD && col >= 0 && col < BOARD ? tiles[row * BOARD + col] : null;
}

function connectedMatch(start, includeWarning = false) {
  if (!start) return [];
  const states = tiles.map((tile) => tile.userData.state);
  const colors = tiles.map((tile) => tile.userData.color);
  const startIndex = start.userData.row * BOARD + start.userData.col;
  const allowedStates = includeWarning ? ['solid', 'warn'] : ['solid'];
  return orthogonalComponent(colors, states, startIndex, BOARD, allowedStates).map((index) => tiles[index]);
}

function randomizeBoard() {
  for (const tile of tiles) {
    clearBonus(tile);
    tile.visible = true;
    tile.position.y = 0;
    tile.rotation.set(0, 0, 0);
    tile.scale.set(1, 1, 1);
    tile.userData.state = 'solid';
    tile.userData.timer = 0;
    tile.userData.vy = 0;
    tile.userData.chainDepth = 0;
    tile.userData.burstTotal = 0;
    tile.userData.burstIndex = 0;
    tile.userData.growTotal = 0;
    tile.userData.bounceAge = 0;
    tile.userData.bounceStrength = 0;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    for (const tile of tiles) applyColor(tile, Math.floor(Math.random() * COLORS.length));
    for (let pass = 0; pass < 240; pass += 1) {
      const problem = tiles.find((tile) => connectedMatch(tile).length >= 4);
      if (!problem) return;
      applyColor(problem, (problem.userData.color + 1 + Math.floor(Math.random() * (COLORS.length - 1))) % COLORS.length);
    }
  }

  const offset = Math.floor(Math.random() * COLORS.length);
  for (const tile of tiles) applyColor(tile, (tile.userData.row * 2 + tile.userData.col * 3 + offset) % COLORS.length);
}

const player = new THREE.Group();
const mascot = new THREE.Group();
const body = new THREE.Mesh(
  new RoundedBoxGeometry(1.08, 0.84, 0.82, 1, 0.22),
  lowPolyMaterial(0xff665c)
);
body.position.y = 0.64;

const footGeometry = new THREE.DodecahedronGeometry(0.2, 0);
const footMaterial = lowPolyMaterial(0x173b52);
for (const x of [-0.29, 0.29]) {
  const foot = new THREE.Mesh(footGeometry, footMaterial);
  foot.position.set(x, 0.14, 0.1);
  foot.scale.set(0.72, 0.56, 1.02);
  mascot.add(foot);
}

const faceMaterial = new THREE.MeshBasicMaterial({ color: 0x173b52 });
const eyeGeometry = new THREE.SphereGeometry(0.062, 6, 4);
for (const x of [-0.21, 0.21]) {
  const eye = new THREE.Mesh(eyeGeometry, faceMaterial);
  eye.position.set(x, 0.69, 0.421);
  mascot.add(eye);
}

const smileCurve = new THREE.QuadraticBezierCurve3(
  new THREE.Vector3(-0.105, 0.57, 0.425),
  new THREE.Vector3(0, 0.48, 0.455),
  new THREE.Vector3(0.105, 0.57, 0.425)
);
const smile = new THREE.Mesh(new THREE.TubeGeometry(smileCurve, 6, 0.025, 4, false), faceMaterial);

const stem = new THREE.Mesh(
  new THREE.CylinderGeometry(0.045, 0.065, 0.34, 5),
  lowPolyMaterial(0x35a96f)
);
stem.position.set(0.1, 1.13, 0);
stem.rotation.z = -0.42;
const leaf = new THREE.Mesh(
  new THREE.DodecahedronGeometry(0.34, 0),
  lowPolyMaterial(0x59c989)
);
leaf.position.set(0.35, 1.35, 0);
leaf.scale.set(1.32, 0.42, 0.68);
leaf.rotation.set(0.08, 0.2, -0.2);

mascot.add(body, smile, stem, leaf);
mascot.traverse((object) => {
  if (object.isMesh) object.castShadow = true;
});
mascot.scale.setScalar(1.28);
player.add(mascot);
player.rotation.y = Math.PI / 4;
scene.add(player);

const playerShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.61, 8),
  new THREE.MeshBasicMaterial({ color: 0x15384a, transparent: true, opacity: 0.22, depthWrite: false })
);
playerShadow.rotation.x = -Math.PI / 2;
scene.add(playerShadow);

const warningBeacon = new THREE.Group();
const warningGem = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.34, 0),
  lowPolyMaterial(0xff665c, { emissive: 0x7a1519, emissiveIntensity: 0.35 })
);
const warningRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.42, 0.035, 4, 12),
  lowPolyMaterial(0xfff5c9)
);
warningRing.rotation.x = Math.PI / 2;
warningBeacon.add(warningGem, warningRing);
warningBeacon.visible = false;
scene.add(warningBeacon);

const particleGeometry = new THREE.TetrahedronGeometry(0.16, 0);
const particles = [];
const shockwaves = [];
function spawnBurst(tile) {
  for (let i = 0; i < 10; i += 1) {
    const particle = new THREE.Mesh(particleGeometry, lowPolyMaterial(COLORS[tile.userData.color], {
      transparent: true,
      opacity: 1
    }));
    particle.position.copy(tile.position);
    particle.position.x += (Math.random() - 0.5) * 0.65;
    particle.position.z += (Math.random() - 0.5) * 0.65;
    particle.position.y += 0.3;
    particle.scale.setScalar(1);
    particle.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 5.8, 3.4 + Math.random() * 4.8, (Math.random() - 0.5) * 5.8);
    particle.userData.life = 0.9 + Math.random() * 0.5;
    particles.push(particle);
    scene.add(particle);
  }
}

function spawnShockwave(group, chainDepth) {
  const center = group.reduce((sum, tile) => sum.add(tile.position), new THREE.Vector3()).multiplyScalar(1 / group.length);
  for (let layer = 0; layer < 2; layer += 1) {
    const wave = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, layer ? 0.045 : 0.075, 5, 24),
      new THREE.MeshBasicMaterial({
        color: layer ? 0xffffff : 0xffef91,
        transparent: true,
        opacity: layer ? 0.72 : 0.94,
        depthWrite: false
      })
    );
    wave.position.set(center.x, 0.54 + layer * 0.12, center.z);
    wave.rotation.x = Math.PI / 2;
    wave.userData.life = 0.34 + layer * 0.1;
    wave.userData.maxLife = wave.userData.life;
    wave.userData.delay = layer * 0.045;
    wave.userData.speed = 7.2 + chainDepth * 0.85 + layer * 1.2;
    wave.scale.setScalar(0.25);
    shockwaves.push(wave);
    scene.add(wave);
  }
}

function clearEffects() {
  for (const particle of particles) {
    scene.remove(particle);
    particle.material.dispose();
  }
  particles.length = 0;
  for (const wave of shockwaves) {
    scene.remove(wave);
    wave.geometry.dispose();
    wave.material.dispose();
  }
  shockwaves.length = 0;
}

const MUSIC_BUS_GAIN = 0.34;

const state = {
  running: false,
  over: false,
  locked: false,
  level: 0,
  score: 0,
  combo: 0,
  lives: 3,
  time: LEVELS[0].time,
  currentTile: null,
  grounded: true,
  hop: null,
  queuedMove: null,
  falling: false,
  respawning: false,
  invulnerable: 0,
  velocity: new THREE.Vector3(),
  warningId: 0,
  refillRemaining: 0,
  nextQueue: [],
  transitionTimer: 0,
  pendingLevelComplete: false,
  chain: 0,
  shake: 0,
  hitStop: 0,
  sound: true,
  audio: null,
  audioOutput: null,
  sfxBus: null,
  musicBus: null,
  musicFilter: null,
  noiseBuffer: null,
  musicNext: 0,
  musicStep: 0,
  lastTimeCue: null,
  audioEvents: []
};

const scheduledTimers = new Set();
function schedule(callback, delay) {
  const timer = setTimeout(() => {
    scheduledTimers.delete(timer);
    callback();
  }, delay);
  scheduledTimers.add(timer);
  return timer;
}

function cancelScheduled() {
  for (const timer of scheduledTimers) clearTimeout(timer);
  scheduledTimers.clear();
}

function ensureAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  state.audio ??= new AudioContextClass();
  if (!state.audioOutput) {
    const compressor = state.audio.createDynamicsCompressor();
    compressor.threshold.value = -17;
    compressor.knee.value = 12;
    compressor.ratio.value = 4.5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;
    const output = state.audio.createGain();
    output.gain.value = 0.78;
    compressor.connect(output).connect(state.audio.destination);
    state.audioOutput = compressor;

    state.sfxBus = state.audio.createGain();
    state.sfxBus.gain.value = 1;
    state.sfxBus.connect(compressor);

    state.musicBus = state.audio.createGain();
    state.musicBus.gain.value = MUSIC_BUS_GAIN;
    state.musicFilter = state.audio.createBiquadFilter();
    state.musicFilter.type = 'highpass';
    state.musicFilter.frequency.value = 210;
    state.musicFilter.Q.value = 0.45;
    state.musicBus.connect(state.musicFilter).connect(compressor);
  }
  if (state.audio.state === 'suspended') state.audio.resume();
  return state.audio;
}

function syncAudioState() {
  document.documentElement.dataset.audioState = state.audio?.state ?? 'not-started';
  document.documentElement.dataset.musicStyle = 'airy-toybox-offbeat';
  document.documentElement.dataset.audioMix = 'character-priority';
  document.documentElement.dataset.musicTempo = String(MUSIC_TEMPO);
  document.documentElement.dataset.musicStep = String(state.musicStep);
  document.documentElement.dataset.sound = String(state.sound);
  const soundButton = document.querySelector('#sound');
  const soundIcon = document.querySelector('#soundIcon');
  soundButton?.setAttribute('aria-pressed', String(state.sound));
  soundButton?.setAttribute('aria-label', state.sound ? '关闭声音' : '打开声音');
  soundButton?.setAttribute('title', state.sound ? '关闭声音' : '打开声音');
  if (soundIcon) soundIcon.src = state.sound ? 'assets/ui-sound-on.png' : 'assets/ui-sound-off.png';
}

function voice({ from, to, duration, volume, delay = 0, type = 'sine', peak = null, at = null, destination = null, attack = 0.012 }) {
  const context = ensureAudio();
  const start = at ?? context.currentTime + delay;
  const end = start + duration;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(45, from), start);
  if (peak) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, peak), start + duration * 0.42);
  }
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, to), end);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(attack, duration * 0.62));
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain).connect(destination ?? state.sfxBus ?? state.audioOutput);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

function ensureNoiseBuffer(context) {
  if (state.noiseBuffer) return state.noiseBuffer;
  state.noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.5), context.sampleRate);
  const data = state.noiseBuffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    last = last * 0.68 + (Math.random() * 2 - 1) * 0.32;
    data[i] = last;
  }
  return state.noiseBuffer;
}

function noisePuff(duration = 0.12, volume = 0.018, frequency = 900, delay = 0) {
  const context = ensureAudio();
  ensureNoiseBuffer(context);
  const start = context.currentTime + delay;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = state.noiseBuffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(frequency * 1.4, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(180, frequency * 0.55), start + duration);
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(state.sfxBus ?? state.audioOutput);
  source.start(start, Math.random() * 0.16, duration);
}

function noiseSnap(duration = 0.065, volume = 0.012, frequency = 4300, delay = 0) {
  const context = ensureAudio();
  ensureNoiseBuffer(context);
  const start = context.currentTime + delay;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = state.noiseBuffer;
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(frequency, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(1500, frequency * 0.62), start + duration);
  filter.Q.value = 0.75;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.0025);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(state.sfxBus ?? state.audioOutput);
  source.start(start, Math.random() * 0.18, duration);
}

function sfx(name, detail = {}) {
  if (!state.sound) return;
  state.audioEvents.push({ name, at: Math.round(performance.now()), ...detail });
  if (state.audioEvents.length > 32) state.audioEvents.shift();
  if (name === 'jump') {
    voice({ from: 310, peak: 545, to: 455, duration: 0.115, volume: 0.026, attack: 0.007 });
    voice({ from: 930, to: 720, duration: 0.052, volume: 0.005, delay: 0.022, type: 'triangle' });
  } else if (name === 'bounce') {
    const note = 326 + (detail.color ?? 0) * 7;
    voice({ from: note, peak: note * 1.48, to: note * 1.22, duration: 0.1, volume: 0.019, attack: 0.006 });
    noisePuff(0.045, 0.0022, 760);
  } else if (name === 'land') {
    const note = 214 + (detail.color ?? 0) * 6;
    voice({ from: note * 1.18, to: note * 0.84, duration: 0.082, volume: 0.012, type: 'sine', attack: 0.009 });
    noisePuff(0.052, 0.0032, 720);
  } else if (name === 'collect') {
    [760, 1050, 1480].forEach((note, index) => voice({ from: note, to: note * 1.08, duration: 0.13, volume: 0.025 - index * 0.003, delay: index * 0.048, type: index === 1 ? 'triangle' : 'sine' }));
  } else if (name === 'ignite' || name === 'warn') {
    const pitch = 1 + (detail.chain ?? 0) * 0.075;
    voice({ from: 560 * pitch, peak: 1080 * pitch, to: 760 * pitch, duration: 0.15, volume: 0.034, type: 'sine' });
    voice({ from: 1140 * pitch, to: 820 * pitch, duration: 0.105, volume: 0.016, delay: 0.032, type: 'triangle' });
    noiseSnap(0.045, 0.006, 5100 * pitch, 0.018);
  } else if (name === 'tick') {
    const pitch = 1 + (detail.chain ?? 0) * 0.075;
    const note = (930 + (detail.step ?? 0) * 105) * pitch;
    voice({ from: note * 0.82, peak: note * 1.16, to: note, duration: 0.052, volume: 0.017, type: 'triangle' });
    voice({ from: note * 1.52, to: note * 1.27, duration: 0.038, volume: 0.007, delay: 0.004 });
  } else if (name === 'explode') {
    const chain = Math.max(1, detail.chain ?? 1);
    const pitch = 1 + (chain - 1) * 0.085;
    const pulseCount = Math.min(7, 3 + Math.floor((detail.size ?? 4) / 2));
    duckMusic(0.26, 0.42);
    voice({ from: 245 * pitch, peak: 390 * pitch, to: 78, duration: 0.34, volume: 0.072, type: 'sine' });
    voice({ from: 620 * pitch, peak: 790 * pitch, to: 270 * pitch, duration: 0.17, volume: 0.025, delay: 0.008, type: 'triangle' });
    const pulseTimes = [0.012, 0.044, 0.082, 0.126, 0.176, 0.232, 0.294];
    for (let index = 0; index < pulseCount; index += 1) {
      const delay = pulseTimes[index];
      const decay = 1 - index * 0.105;
      voice({
        from: (920 + index * 62) * pitch,
        peak: (1420 + index * 85) * pitch,
        to: (610 + index * 38) * pitch,
        duration: 0.075 + index * 0.007,
        volume: 0.021 * decay,
        delay,
        type: index % 2 ? 'triangle' : 'sine'
      });
      noiseSnap(0.052, 0.012 * decay, (5200 + index * 270) * pitch, delay);
    }
    noisePuff(0.22, 0.018, 980, 0.015);
    [760, 1040, 1420].forEach((note, index) => voice({
      from: note * pitch,
      to: note * 1.13 * pitch,
      duration: 0.16,
      volume: 0.014 - index * 0.002,
      delay: 0.12 + index * 0.045,
      type: index === 1 ? 'triangle' : 'sine'
    }));
  } else if (name === 'tilePop') {
    const pitch = 1 + (detail.chain ?? 0) * 0.065 + ((detail.index ?? 0) % 4) * 0.035;
    voice({ from: 360 * pitch, peak: 560 * pitch, to: 210 * pitch, duration: 0.105, volume: 0.012, type: 'sine' });
    voice({ from: 1020 * pitch, to: 720 * pitch, duration: 0.055, volume: 0.006, delay: 0.006, type: 'triangle' });
  } else if (name === 'grow') {
    const note = 440 + (detail.color ?? 0) * 24;
    voice({ from: 230, peak: 340, to: note, duration: 0.13, volume: 0.013, type: 'sine' });
    voice({ from: 680, to: 940, duration: 0.07, volume: 0.005, delay: 0.035, type: 'triangle' });
    noisePuff(0.045, 0.002, 1180);
  } else if (name === 'ready') {
    [740, 880, 1175].forEach((note, index) => voice({ from: note * 0.98, to: note, duration: index === 2 ? 0.28 : 0.12, volume: index === 2 ? 0.02 : 0.014, delay: index * 0.095, type: index === 1 ? 'triangle' : 'sine' }));
  } else if (name === 'levelStart') {
    [660, 880, 1040].forEach((note, index) => voice({ from: note, to: note * 1.025, duration: 0.15, volume: 0.014, delay: index * 0.075, type: index === 1 ? 'triangle' : 'sine' }));
  } else if (name === 'levelClear') {
    duckMusic(0.48, 0.78);
    [740, 930, 1175, 1480].forEach((note, index) => voice({ from: note * 0.985, to: note * 1.025, duration: index === 3 ? 0.42 : 0.18, volume: index === 3 ? 0.027 : 0.019, delay: index * 0.105, type: index % 2 ? 'triangle' : 'sine' }));
    noiseSnap(0.09, 0.004, 6400, 0.33);
  } else if (name === 'fall') {
    voice({ from: 680, peak: 760, to: 310, duration: 0.36, volume: 0.021, type: 'sine', attack: 0.025 });
  } else if (name === 'lifeLost' || name === 'lastLife') {
    const delay = detail.delay ?? 0;
    voice({ from: 520, to: 390, duration: 0.22, volume: 0.021, delay, type: 'triangle', attack: 0.018 });
    voice({ from: 340, to: name === 'lastLife' ? 205 : 255, duration: 0.3, volume: 0.022, delay: delay + 0.15, type: 'sine', attack: 0.025 });
    noisePuff(0.16, 0.006, 480, delay + 0.13);
  } else if (name === 'countdown') {
    const note = detail.second === 1 ? 1040 : 820;
    voice({ from: note, to: note * 0.965, duration: detail.second === 1 ? 0.15 : 0.085, volume: 0.011, type: 'sine' });
  } else if (name === 'timeout') {
    [660, 520, 390].forEach((note, index) => voice({ from: note, to: note * 0.91, duration: index === 2 ? 0.5 : 0.22, volume: 0.024, delay: index * 0.21, type: index === 1 ? 'triangle' : 'sine', attack: 0.025 }));
    noisePuff(0.28, 0.007, 520, 0.38);
  } else if (name === 'gameOver') {
    [520, 415, 330, 247].forEach((note, index) => voice({ from: note * 1.035, to: note, duration: index === 3 ? 0.72 : 0.3, volume: index === 3 ? 0.026 : 0.019, delay: index * 0.19, type: index % 2 ? 'triangle' : 'sine', attack: 0.035 }));
    noisePuff(0.34, 0.006, 410, 0.56);
  } else if (name === 'fullClear') {
    const phrase = [740, 930, 1175, 1397, 1760, 1480, 1976];
    phrase.forEach((note, index) => voice({ from: note * 0.985, to: note * 1.018, duration: index === phrase.length - 1 ? 0.78 : 0.22, volume: index === phrase.length - 1 ? 0.029 : 0.019, delay: index * 0.115, type: index % 3 === 1 ? 'triangle' : 'sine', attack: 0.016 }));
    [0.18, 0.43, 0.7].forEach((delay, index) => noiseSnap(0.1, 0.0045 - index * 0.0005, 6200 + index * 700, delay));
  } else if (name === 'toggle') {
    voice({ from: 620, peak: 1080, to: 900, duration: 0.13, volume: 0.026 });
  }
}

function scheduleWarningTicks(duration, chainDepth) {
  const ratios = chainDepth > 0 ? [0.16, 0.38, 0.58, 0.75, 0.88] : [0.2, 0.46, 0.66, 0.81, 0.92];
  ratios.forEach((ratio, step) => schedule(() => {
    if (state.running && !state.over) sfx('tick', { step, chain: chainDepth });
  }, duration * ratio * 1000));
}

const MUSIC_TEMPO = 118;
const MUSIC_STEP_SECONDS = 60 / MUSIC_TEMPO / 2;
const MUSIC_LOOKAHEAD = 0.18;
const MUSIC_CHORDS = [
  { pad: 60, notes: [72, 76, 79], bell: 96 },
  { pad: 55, notes: [71, 74, 79], bell: 95 },
  { pad: 57, notes: [72, 76, 81], bell: 96 },
  { pad: 53, notes: [69, 72, 77], bell: 93 },
  { pad: 60, notes: [72, 76, 79], bell: 96 },
  { pad: 52, notes: [71, 76, 79], bell: 95 },
  { pad: 53, notes: [69, 72, 77], bell: 96 },
  { pad: 55, notes: [71, 74, 79], bell: 98 }
];
const MUSIC_MELODY = [
  null, 84, null, 88, null, 86, 81, null,
  null, 83, 86, null, null, 90, null, 86,
  null, 84, null, 88, 91, null, 88, null,
  null, 81, 84, null, 89, null, 84, null,
  null, 88, null, 84, null, 81, 84, null,
  null, 83, null, 86, 91, null, 86, null,
  null, 84, 89, null, null, 88, null, 84,
  null, 86, null, 91, null, 90, 86, null
];

function midiFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function musicNoise({ at, duration, volume, frequency }) {
  const context = ensureAudio();
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = ensureNoiseBuffer(context);
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(frequency, at);
  filter.Q.value = 0.7;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter).connect(gain).connect(state.musicBus);
  source.start(at, Math.random() * 0.16, duration);
}

function musicPluck(at, note, accent = false) {
  const frequency = midiFrequency(note);
  voice({
    from: frequency * 1.012,
    to: frequency,
    duration: accent ? 0.24 : 0.18,
    volume: accent ? 0.027 : 0.021,
    type: 'triangle',
    at,
    destination: state.musicBus,
    attack: 0.014
  });
  voice({
    from: frequency * 2.018,
    to: frequency * 2,
    duration: 0.095,
    volume: accent ? 0.007 : 0.0045,
    type: 'sine',
    at: at + 0.005,
    destination: state.musicBus
  });
}

function musicChord(at, notes, soft = false) {
  notes.forEach((note, index) => {
    const frequency = midiFrequency(note);
    voice({
      from: frequency * 1.006,
      to: frequency,
      duration: soft ? 0.48 : 0.7,
      volume: soft ? 0.0035 : 0.005,
      type: 'sine',
      at: at + index * 0.014,
      destination: state.musicBus,
      attack: soft ? 0.07 : 0.11
    });
  });
}

function musicPad(at, note) {
  const frequency = midiFrequency(note);
  voice({
    from: frequency * 1.006,
    to: frequency * 0.997,
    duration: 0.92,
    volume: 0.0065,
    type: 'sine',
    at: at + 0.035,
    destination: state.musicBus,
    attack: 0.14
  });
}

function musicAir(at, brighter = false) {
  musicNoise({ at, duration: 0.032, volume: brighter ? 0.003 : 0.0018, frequency: brighter ? 7600 : 6200 });
}

function musicBell(at, note, volume = 0.014) {
  const frequency = midiFrequency(note);
  voice({ from: frequency, to: frequency * 0.998, duration: 0.48, volume, type: 'sine', at, destination: state.musicBus, attack: 0.025 });
  voice({ from: frequency * 2.01, to: frequency * 2, duration: 0.24, volume: volume * 0.36, type: 'triangle', at: at + 0.008, destination: state.musicBus, attack: 0.018 });
}

function scheduleMusicStep(step, at) {
  const loopStep = step % MUSIC_MELODY.length;
  const bar = Math.floor(loopStep / 8);
  const beat = loopStep % 8;
  const chord = MUSIC_CHORDS[bar];
  const melodyNote = MUSIC_MELODY[loopStep];

  if (melodyNote !== null) musicPluck(at, melodyNote, beat === 3 || beat === 5);

  if (beat === 0) {
    musicPad(at, chord.pad);
    musicChord(at + 0.035, chord.notes);
    if (bar % 2 === 0) musicBell(at + MUSIC_STEP_SECONDS * 2.55, chord.bell, 0.0065);
  } else if (beat === 4) {
    musicChord(at + 0.05, chord.notes, true);
  }

  if ((beat === 3 && bar % 3 !== 1) || (beat === 7 && bar % 2 === 1)) musicAir(at + 0.035, beat === 7);
  if (bar >= 4 && beat === 5) musicBell(at + 0.025, chord.bell + 7, 0.005);
}

function duckMusic(level = 0.3, duration = 0.36) {
  if (!state.sound || !state.audio || !state.musicBus) return;
  const now = state.audio.currentTime;
  const gain = state.musicBus.gain;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(Math.max(0.0001, gain.value), now);
  gain.linearRampToValueAtTime(MUSIC_BUS_GAIN * level, now + 0.018);
  gain.exponentialRampToValueAtTime(MUSIC_BUS_GAIN, now + duration);
}

function stopMusic() {
  if (!state.audio || !state.musicBus) return;
  const now = state.audio.currentTime;
  const gain = state.musicBus.gain;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(Math.max(0.0001, gain.value), now);
  gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  syncAudioState();
}

function startMusic() {
  const context = ensureAudio();
  const gain = state.musicBus.gain;
  gain.cancelScheduledValues(context.currentTime);
  gain.setValueAtTime(0.0001, context.currentTime);
  gain.exponentialRampToValueAtTime(MUSIC_BUS_GAIN, context.currentTime + 0.12);
  state.musicStep = 0;
  state.musicNext = context.currentTime + 0.08;
  syncAudioState();
}

function updateMusic() {
  if (!state.sound || !state.running || !state.audio) return;
  const now = state.audio.currentTime;
  if (state.musicNext < now - MUSIC_STEP_SECONDS * 2) state.musicNext = now + 0.04;
  let scheduled = 0;
  while (state.musicNext < now + MUSIC_LOOKAHEAD && scheduled < 8) {
    scheduleMusicStep(state.musicStep, state.musicNext);
    const swing = state.musicStep % 2 === 0 ? 1.06 : 0.94;
    state.musicNext += MUSIC_STEP_SECONDS * swing;
    state.musicStep += 1;
    scheduled += 1;
  }
  syncAudioState();
}

function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => ui.toast.classList.remove('show'), 1450);
}

function refreshNext() {
  ui.next.replaceChildren(...state.nextQueue.slice(0, 4).map((color) => {
    const cube = document.createElement('i');
    cube.style.backgroundColor = `#${COLORS[color].toString(16).padStart(6, '0')}`;
    cube.title = COLOR_DEFS[color].name;
    return cube;
  }));
}

function fillNextQueue() {
  while (state.nextQueue.length < 8) state.nextQueue.push(Math.floor(Math.random() * COLORS.length));
  refreshNext();
}

function takeNextColor() {
  fillNextQueue();
  const color = state.nextQueue.shift();
  state.nextQueue.push(Math.floor(Math.random() * COLORS.length));
  refreshNext();
  return color;
}

function refreshHud() {
  ui.level.textContent = state.level + 1;
  ui.score.textContent = state.score.toString().padStart(6, '0');
  ui.timer.textContent = Math.max(0, Math.ceil(state.time));
  ui.combo.textContent = state.combo.toString().padStart(2, '0');
  ui.goal.textContent = LEVELS[state.level].goal.toString().padStart(2, '0');
  ui.lives.replaceChildren(...Array.from({ length: MAX_LIVES }, (_, index) => {
    const pip = document.createElement('i');
    pip.classList.toggle('lost', index >= state.lives);
    return pip;
  }));
  ui.lives.setAttribute('aria-label', `剩余${state.lives}条生命`);
  document.documentElement.dataset.gameState = JSON.stringify({
    level: state.level + 1,
    score: state.score,
    combo: state.combo,
    goal: LEVELS[state.level].goal,
    levels: LEVELS.length,
    difficulty: LEVELS[state.level].difficulty,
    warningTime: LEVELS[state.level].warning,
    time: Math.max(0, state.time),
    lives: state.lives,
    refill: state.refillRemaining,
    chain: state.chain,
    hitStop: state.hitStop,
    shockwaves: shockwaves.length,
    particles: particles.length,
    locked: state.locked,
    pendingLevelComplete: state.pendingLevelComplete,
    sound: state.sound,
    audioState: state.audio?.state ?? 'not-started',
    musicStyle: 'airy-toybox-offbeat',
    audioMix: 'character-priority',
    musicTempo: MUSIC_TEMPO,
    recentAudioEvents: state.audioEvents.slice(-12),
    characterMode: 'procedural-low-poly-3d',
    respawning: state.respawning,
    invulnerable: state.invulnerable,
    matchRule: 'orthogonal-connected-4',
    player: state.currentTile ? [state.currentTile.userData.row, state.currentTile.userData.col] : null,
    colors: tiles.map((tile) => tile.userData.color),
    states: tiles.map((tile) => tile.userData.state),
    tileTimers: tiles.map((tile) => Number(tile.userData.timer.toFixed(3)))
  });
}

function clearBonus(tile) {
  if (!tile?.userData.bonus) return;
  const bonus = tile.userData.bonus;
  tile.remove(bonus);
  bonus.material.dispose();
  tile.userData.bonus = null;
}

const BONUS_DEFS = [
  { name: '金币', value: 180, color: 0xffd24a, emissive: 0x8a5c00, geometry: new THREE.CylinderGeometry(0.31, 0.31, 0.11, 10) },
  { name: '蓝宝石', value: 320, color: 0x49b9ef, emissive: 0x06476d, geometry: new THREE.OctahedronGeometry(0.38, 0) },
  { name: '红宝石', value: 520, color: 0xff5e73, emissive: 0x751629, geometry: new THREE.OctahedronGeometry(0.4, 0) },
  { name: '祖母绿', value: 760, color: 0x57cf83, emissive: 0x145f39, geometry: new THREE.DodecahedronGeometry(0.39, 0) },
  { name: '钻石', value: 1050, color: 0xe9ffff, emissive: 0x3899ad, geometry: new THREE.OctahedronGeometry(0.43, 0) },
  { name: '金条', value: 1450, color: 0xffbd35, emissive: 0x8a4e00, geometry: new RoundedBoxGeometry(0.58, 0.24, 0.34, 1, 0.06) }
];

function spawnBonus(rank = 0) {
  const candidates = tiles.filter((tile) => tile.userData.state === 'solid' && tile !== state.currentTile && !tile.userData.bonus);
  if (!candidates.length) return;
  const tile = candidates[Math.floor(Math.random() * candidates.length)];
  const definition = BONUS_DEFS[Math.min(BONUS_DEFS.length - 1, Math.max(0, rank))];
  const bonus = new THREE.Mesh(definition.geometry, lowPolyMaterial(definition.color, {
    emissive: definition.emissive,
    emissiveIntensity: 0.22
  }));
  bonus.position.y = 1.03;
  bonus.castShadow = true;
  bonus.userData = {
    phase: Math.random() * Math.PI * 2,
    reward: definition.value,
    label: definition.name,
    rank: BONUS_DEFS.indexOf(definition)
  };
  tile.add(bonus);
  tile.userData.bonus = bonus;
}

function collectBonus(tile) {
  if (!tile.userData.bonus) return;
  const { reward, label } = tile.userData.bonus.userData;
  clearBonus(tile);
  state.score += reward;
  showToast(`${label} +${reward}`);
  sfx('collect');
}

function startLevel(index) {
  cancelScheduled();
  clearEffects();
  state.level = index;
  state.combo = 0;
  state.time = LEVELS[index].time;
  state.locked = false;
  state.transitionTimer = 0;
  state.pendingLevelComplete = false;
  state.lastTimeCue = null;
  state.refillRemaining = 0;
  state.chain = 0;
  state.hitStop = 0;
  state.shake = 0;
  state.respawning = false;
  state.invulnerable = 0;
  state.nextQueue = [];
  fillNextQueue();
  randomizeBoard();
  const startTile = tileAt(3, 3);
  player.position.set(startTile.position.x, PLAYER_BASE, startTile.position.z);
  player.rotation.set(0, Math.PI / 4, 0);
  mascot.rotation.set(0, 0, 0);
  mascot.position.y = 0;
  player.visible = true;
  player.scale.set(1, 1, 1);
  state.velocity.set(0, 0, 0);
  state.currentTile = startTile;
  state.grounded = true;
  state.hop = null;
  state.queuedMove = null;
  state.falling = false;
  refreshHud();
  schedule(spawnBonus, 450);
  showToast(`第 ${index + 1}/${LEVELS.length} 层 · ${LEVELS[index].name} · ${LEVELS[index].difficulty}`);
  sfx(index === 0 ? 'ready' : 'levelStart', { level: index });
}

function reset() {
  cancelScheduled();
  ensureAudio();
  if (state.sound) startMusic();
  state.running = true;
  state.over = false;
  state.score = 0;
  state.chain = 0;
  state.lives = MAX_LIVES;
  state.audioEvents = [];
  state.respawning = false;
  state.invulnerable = 0;
  ui.intro.classList.remove('show');
  ui.result.classList.remove('show');
  startLevel(0);
}

function finish(win, reason = '', outcome = 'gameOver') {
  if (state.over) return;
  cancelScheduled();
  state.running = false;
  state.over = true;
  state.locked = true;
  state.queuedMove = null;
  pointerStart = null;
  stopMusic();
  $('#finalScore').textContent = state.score;
  $('#resultTag').textContent = win ? '全部通关' : '挑战结束';
  $('#resultTitle').textContent = win ? '方阵大师' : reason;
  $('#resultText').textContent = win ? `${LEVELS.length} 层方块风暴全部完成。` : '看准警告，在爆炸前跳到安全方块。';
  schedule(() => ui.result.classList.add('show'), 420);
  sfx(win ? 'fullClear' : outcome);
}

function canLand(tile) {
  return tile && (tile.userData.state === 'solid' || tile.userData.state === 'warn');
}

function hopTo(rowDelta, colDelta, silentStart = false) {
  if (!state.running || state.locked || !state.grounded || state.hop || state.falling || !state.currentTile) return false;
  if (Math.abs(rowDelta) + Math.abs(colDelta) !== 1) return false;
  const from = state.currentTile;
  const { row, col } = from.userData;
  const target = tileAt(row + rowDelta, col + colDelta);
  if (!canLand(target)) return false;
  const toX = target.position.x;
  const toZ = target.position.z;
  state.hop = {
    fromX: player.position.x,
    fromZ: player.position.z,
    toX,
    toZ,
    target,
    facing: Math.atan2(colDelta, rowDelta),
    elapsed: 0,
    duration: HOP_DURATION
  };
  state.currentTile = null;
  state.grounded = false;
  player.rotation.y = state.hop.facing;
  if (!silentStart) sfx('jump');
  return true;
}

function requestMove(rowDelta, colDelta, haptic = false, silentStart = false) {
  if (!state.running || state.locked || state.falling) return false;
  if (state.hop || !state.grounded || !state.currentTile) {
    if (state.hop) {
      state.queuedMove = [rowDelta, colDelta];
      if (haptic) navigator.vibrate?.(8);
      return true;
    }
    return false;
  }
  const accepted = hopTo(rowDelta, colDelta, silentStart);
  if (accepted && haptic) navigator.vibrate?.(12);
  return accepted;
}

function triggerMatch(tile) {
  const group = connectedMatch(tile, true);
  const flashing = group.filter((member) => member.userData.state === 'warn');
  if (flashing.length) {
    const added = extendWarningGroup(group, flashing);
    if (added.length) showToast(`${added.length} 格加入闪烁 · 快撤离`);
    return added.length ? group : [];
  }
  if (group.length < 4) return [];
  igniteTiles(group, 0, LEVELS[state.level].warning);
  showToast(`${group.length} 格连通 · 快撤离`);
  return group;
}

function styleWarningTile(member) {
  member.userData.mainMat.emissive.setHex(0x5c1421);
  member.userData.topMat.emissive.setHex(0xffe48a);
  member.userData.mainMat.emissiveIntensity = 0.7;
  member.userData.topMat.emissiveIntensity = 0.9;
}

function extendWarningGroup(group, flashing) {
  const added = group.filter((member) => member.userData.state === 'solid');
  if (!added.length) return [];
  const remaining = Math.max(0.05, Math.min(...flashing.map((member) => member.userData.timer)));
  const earliest = flashing.find((member) => member.userData.timer === Math.min(...flashing.map((item) => item.userData.timer)));
  const warningId = earliest.userData.warningId;
  const chainDepth = Math.max(...flashing.map((member) => member.userData.chainDepth || 0));
  for (const member of group) {
    member.userData.state = 'warn';
    member.userData.warningId = warningId;
    member.userData.chainDepth = chainDepth;
    member.userData.timer = remaining;
    member.userData.burstTotal = remaining;
    styleWarningTile(member);
  }
  sfx('ignite', { chain: chainDepth });
  return added;
}

function igniteTiles(group, chainDepth, timer) {
  const members = group.filter((tile) => tile?.userData.state === 'solid');
  if (!members.length) return [];
  const warningId = ++state.warningId;
  for (const member of members) {
    member.userData.state = 'warn';
    member.userData.warningId = warningId;
    member.userData.chainDepth = chainDepth;
    member.userData.timer = timer;
    member.userData.burstTotal = timer;
    styleWarningTile(member);
  }
  sfx('ignite', { chain: chainDepth });
  scheduleWarningTicks(timer, chainDepth);
  return members;
}

function respawnPlayer() {
  if (!state.running || state.over || state.lives <= 0) return;
  const safeTiles = tiles.filter((tile) => tile.userData.state === 'solid');
  if (!safeTiles.length) {
    schedule(respawnPlayer, 240);
    return;
  }
  safeTiles.sort((a, b) => {
    const distanceA = Math.abs(a.userData.row - 3) + Math.abs(a.userData.col - 3);
    const distanceB = Math.abs(b.userData.row - 3) + Math.abs(b.userData.col - 3);
    return distanceA - distanceB;
  });
  const tile = safeTiles[0];
  player.visible = true;
  player.position.set(tile.position.x, PLAYER_BASE, tile.position.z);
  player.rotation.set(0, Math.PI / 4, 0);
  player.scale.set(1, 1, 1);
  mascot.rotation.set(0, 0, 0);
  mascot.position.y = 0;
  state.velocity.set(0, 0, 0);
  state.currentTile = tile;
  state.grounded = true;
  state.hop = null;
  state.queuedMove = null;
  state.falling = false;
  state.respawning = false;
  state.invulnerable = 1.35;
  state.locked = false;
  showToast('继续挑战');
  refreshHud();
}

function loseLife(reason, cause = 'fall') {
  if (!state.running || state.over || state.respawning || state.invulnerable > 0) return;
  state.lives = Math.max(0, state.lives - 1);
  state.respawning = true;
  state.locked = true;
  state.currentTile = null;
  state.grounded = false;
  state.hop = null;
  state.queuedMove = null;
  state.falling = true;
  state.velocity.y = -2.4;
  refreshHud();
  sfx(state.lives > 0 ? 'lifeLost' : 'lastLife', { delay: cause === 'blast' ? 0.22 : 0 });
  showToast(state.lives > 0 ? `${reason} · 还剩 ${state.lives} 条生命` : reason);
  schedule(() => {
    if (state.lives <= 0) finish(false, '生命用完了', 'gameOver');
    else respawnPlayer();
  }, 1050);
}

function explodeGroup(group) {
  if (!group.length) return;
  const playerCaught = !state.respawning && state.invulnerable <= 0
    && state.grounded && state.currentTile && group.includes(state.currentTile);
  const chainDepth = Math.max(...group.map((tile) => tile.userData.chainDepth || 0));
  const centerRow = group.reduce((sum, tile) => sum + tile.userData.row, 0) / group.length;
  const centerCol = group.reduce((sum, tile) => sum + tile.userData.col, 0) / group.length;
  const ordered = [...group].sort((a, b) => {
    const distanceA = Math.hypot(a.userData.row - centerRow, a.userData.col - centerCol);
    const distanceB = Math.hypot(b.userData.row - centerRow, b.userData.col - centerCol);
    return distanceA - distanceB;
  });
  for (const [index, tile] of ordered.entries()) {
    const distance = Math.hypot(tile.userData.row - centerRow, tile.userData.col - centerCol);
    tile.userData.state = 'bursting';
    tile.userData.timer = EXPLOSION_TIMING.burstBase
      + distance * EXPLOSION_TIMING.burstDistance
      + index * EXPLOSION_TIMING.burstStagger;
    tile.userData.burstTotal = tile.userData.timer;
    tile.userData.burstIndex = index;
    tile.userData.bounceStrength = 0;
    tile.userData.mainMat.emissive.setHex(0xffd75e);
    tile.userData.topMat.emissive.setHex(0xffffff);
    tile.userData.mainMat.emissiveIntensity = 1.1;
    tile.userData.topMat.emissiveIntensity = 1.55;
  }
  spawnShockwave(group, chainDepth);
  state.hitStop = Math.min(0.085, 0.052 + chainDepth * 0.009);
  state.shake = Math.min(0.5, 0.16 + group.length * 0.021 + chainDepth * 0.055);
  sfx('explode', { chain: chainDepth + 1, size: group.length });
  if (!state.running) return;
  const multiplier = chainDepth + 1;
  const points = group.length * 50 * multiplier;
  state.chain = multiplier;
  state.refillRemaining += group.length;
  state.combo += 1;
  state.score += points;
  refreshHud();
  showToast(chainDepth > 0 ? `连锁 ×${multiplier}  +${points}` : `爆破 +${points}`);

  const rewardRank = Math.min(BONUS_DEFS.length - 1, chainDepth + (group.length >= 6 ? 1 : 0));
  if (Math.random() < 0.72) schedule(() => spawnBonus(rewardRank), 850);
  if (state.combo >= LEVELS[state.level].goal) state.pendingLevelComplete = true;
  if (playerCaught) loseLife('被爆炸卷走了', 'blast');
}

function landOn(tile, silent = false) {
  player.position.set(tile.position.x, tile.position.y + PLAYER_BASE, tile.position.z);
  state.currentTile = tile;
  state.grounded = true;
  collectBonus(tile);
  if (tile.userData.state === 'solid') {
    tile.userData.bounceAge = 0;
    tile.userData.bounceStrength = 1;
    applyColor(tile, (tile.userData.color + 1) % COLORS.length);
    if (!silent) sfx('land', { color: tile.userData.color });
    triggerMatch(tile);
  }
  return tile.userData.color;
}

const keyMoves = {
  KeyW: [-1, 0], ArrowUp: [-1, 0],
  KeyS: [1, 0], ArrowDown: [1, 0],
  KeyA: [0, -1], ArrowLeft: [0, -1],
  KeyD: [0, 1], ArrowRight: [0, 1]
};
addEventListener('keydown', (event) => {
  const move = keyMoves[event.code];
  if (!move) return;
  event.preventDefault();
  requestMove(...move);
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const swipePad = $('#swipePad');
const swipeKnob = swipePad.querySelector('i');
let pointerStart = null;

function updateSwipePad(x, y, deltaX = 0, deltaY = 0) {
  const distance = Math.hypot(deltaX, deltaY);
  const limit = Math.min(25, distance);
  const angle = Math.atan2(deltaY, deltaX);
  swipePad.style.left = `${x}px`;
  swipePad.style.top = `${y}px`;
  swipeKnob.style.transform = `translate(calc(-50% + ${Math.cos(angle) * limit}px),calc(-50% + ${Math.sin(angle) * limit}px))`;
}

function moveForSwipe(deltaX, deltaY) {
  const length = Math.hypot(deltaX, deltaY) || 1;
  const swipeX = deltaX / length;
  const swipeY = deltaY / length;
  const origin = new THREE.Vector3(0, 0, 0).project(camera);
  const candidates = [
    { move: [-1, 0], point: new THREE.Vector3(0, 0, -STEP) },
    { move: [1, 0], point: new THREE.Vector3(0, 0, STEP) },
    { move: [0, -1], point: new THREE.Vector3(-STEP, 0, 0) },
    { move: [0, 1], point: new THREE.Vector3(STEP, 0, 0) }
  ];
  let best = candidates[0];
  let bestDot = -Infinity;
  for (const candidate of candidates) {
    candidate.point.project(camera);
    const screenX = candidate.point.x - origin.x;
    const screenY = -(candidate.point.y - origin.y);
    const screenLength = Math.hypot(screenX, screenY) || 1;
    const dot = swipeX * (screenX / screenLength) + swipeY * (screenY / screenLength);
    if (dot > bestDot) {
      best = candidate;
      bestDot = dot;
    }
  }
  return best.move;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  const swipeEnabled = event.pointerType === 'touch' || innerWidth < 760;
  pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId, swipeEnabled, moved: false, move: null, nextMoveAt: 0 };
  if (swipeEnabled) {
    renderer.domElement.setPointerCapture?.(event.pointerId);
    updateSwipePad(event.clientX, event.clientY);
    swipePad.classList.add('show');
  }
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!pointerStart || event.pointerId !== pointerStart.id || !pointerStart.swipeEnabled) return;
  const deltaX = event.clientX - pointerStart.x;
  const deltaY = event.clientY - pointerStart.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance > 10) pointerStart.moved = true;
  if (distance >= 24) {
    const move = moveForSwipe(deltaX, deltaY);
    if (!pointerStart.move || move[0] !== pointerStart.move[0] || move[1] !== pointerStart.move[1]) {
      pointerStart.move = move;
      pointerStart.nextMoveAt = performance.now() + HELD_MOVE_INTERVAL;
      requestMove(...move, true);
    }
  }
  updateSwipePad(pointerStart.x, pointerStart.y, deltaX, deltaY);
  event.preventDefault();
}, { passive: false });
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerStart || event.pointerId !== pointerStart.id) return;
  const start = pointerStart;
  pointerStart = null;
  swipePad.classList.remove('show');
  const deltaX = event.clientX - start.x;
  const deltaY = event.clientY - start.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (start.swipeEnabled && distance >= 24 && !start.move) {
    requestMove(...moveForSwipe(deltaX, deltaY), true);
    return;
  }
  if (start.move) return;
  if (distance > 8 || !state.currentTile) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(tileMeshes, false)[0];
  const target = hit?.object.userData.tile;
  if (!target) return;
  const rowDelta = target.userData.row - state.currentTile.userData.row;
  const colDelta = target.userData.col - state.currentTile.userData.col;
  if (Math.abs(rowDelta) + Math.abs(colDelta) === 1) requestMove(rowDelta, colDelta, event.pointerType === 'touch');
});
renderer.domElement.addEventListener('pointercancel', () => {
  pointerStart = null;
  swipePad.classList.remove('show');
});

function updateHeldInput() {
  const now = performance.now();
  if (pointerStart?.move && now >= pointerStart.nextMoveAt) {
    requestMove(...pointerStart.move);
    pointerStart.nextMoveAt = now + HELD_MOVE_INTERVAL;
  }
}

function updatePlayer(delta, elapsed) {
  if (state.hop) {
    const hop = state.hop;
    const progress = Math.min(1, (hop.elapsed += delta) / hop.duration);
    const ease = progress * progress * (3 - 2 * progress);
    const arc = Math.sin(Math.PI * progress);
    player.position.x = THREE.MathUtils.lerp(hop.fromX, hop.toX, ease);
    player.position.z = THREE.MathUtils.lerp(hop.fromZ, hop.toZ, ease);
    player.position.y = PLAYER_BASE + arc * 1.42;
    player.scale.set(1 - arc * 0.08, 1 + arc * 0.12, 1);
    mascot.rotation.x = -arc * 0.14;
    if (progress >= 1) {
      state.hop = null;
      player.scale.set(1.14, 0.78, 1);
      if (canLand(hop.target)) {
        const queuedMove = state.queuedMove;
        state.queuedMove = null;
        const landedColor = landOn(hop.target, Boolean(queuedMove));
        const chained = Boolean(queuedMove && state.running && !state.locked
          && requestMove(...queuedMove, false, true));
        if (queuedMove) sfx(chained ? 'bounce' : 'land', { color: landedColor });
      } else {
        state.queuedMove = null;
        state.falling = true;
        state.velocity.y = 0;
        sfx('fall');
      }
    }
  } else if (state.falling) {
    state.velocity.y -= 18 * delta;
    player.position.y += state.velocity.y * delta;
    player.rotation.x += delta * 2.1;
    player.rotation.z += delta * 1.35;
    player.scale.lerp(new THREE.Vector3(1, 1, 1), 0.14);
  } else {
    player.scale.lerp(new THREE.Vector3(1, 1, 1), 0.2);
    mascot.rotation.x = THREE.MathUtils.lerp(mascot.rotation.x, 0, 0.16);
    mascot.position.y = Math.sin(elapsed * 3.4) * 0.025;
  }
  if (player.position.y < -7 && state.falling) {
    if (state.respawning) player.visible = false;
    else loseLife('掉出方阵了', 'fall');
  }
}

function updateTileBounce(tile, delta) {
  const data = tile.userData;
  if (data.bounceStrength > 0.015) {
    data.bounceAge += delta;
    data.bounceStrength *= Math.exp(-4.8 * delta);
    const wave = Math.cos(data.bounceAge * 17) * data.bounceStrength;
    tile.scale.set(1 + wave * 0.065, 1 - wave * 0.13, 1 + wave * 0.065);
    return;
  }
  data.bounceStrength = 0;
  const settle = 1 - Math.exp(-14 * delta);
  tile.scale.x = THREE.MathUtils.lerp(tile.scale.x, 1, settle);
  tile.scale.y = THREE.MathUtils.lerp(tile.scale.y, 1, settle);
  tile.scale.z = THREE.MathUtils.lerp(tile.scale.z, 1, settle);
}

function updateTiles(delta, elapsed) {
  const expiredWarnings = new Set();
  for (const tile of tiles) {
    const data = tile.userData;
    if (data.state === 'warn') {
      data.timer -= delta;
      tile.position.y = Math.sin(elapsed * 28 + data.row + data.col) * 0.045;
      updateTileBounce(tile, delta);
      const pulse = 0.55 + Math.sin(elapsed * 20) * 0.35;
      data.topMat.emissiveIntensity = pulse + 0.5;
      if (data.timer <= 0) expiredWarnings.add(data.warningId);
    } else if (data.state === 'bursting') {
      data.timer -= delta;
      const progress = 1 - Math.max(0, data.timer) / Math.max(0.001, data.burstTotal);
      const squeeze = Math.sin(Math.min(1, progress) * Math.PI * 0.5);
      tile.position.y = Math.sin(Math.min(1, progress) * Math.PI) * 0.12;
      tile.scale.set(1 + squeeze * 0.16, 1 - squeeze * 0.28, 1 + squeeze * 0.16);
      data.mainMat.emissiveIntensity = 1.1 + squeeze * 0.75;
      data.topMat.emissiveIntensity = 1.55 + squeeze * 0.65;
      if (data.timer <= 0) {
        clearBonus(tile);
        spawnBurst(tile);
        data.state = 'falling';
        data.timer = 0.72 + Math.random() * 0.18;
        data.vy = -2.8 - Math.random() * 1.4;
        data.mainMat.emissiveIntensity = 0;
        data.topMat.emissiveIntensity = 0;
        sfx('tilePop', { index: data.burstIndex, chain: data.chainDepth });
      }
    } else if (data.state === 'falling') {
      data.vy -= 9 * delta;
      tile.position.y += data.vy * delta;
      tile.rotation.x += delta * 0.7;
      tile.rotation.z += delta * 0.45;
      data.timer -= delta;
      if (data.timer <= 0) {
        data.state = 'empty';
        data.timer = 0.34 + data.burstIndex * 0.085 + data.chainDepth * 0.12;
        tile.visible = false;
        tile.position.y = -4;
        tile.rotation.set(0, 0, 0);
      }
    } else if (data.state === 'empty') {
      data.timer -= delta;
      if (data.timer <= 0) {
        data.state = 'growing';
        data.timer = 0.48 + Math.random() * 0.08;
        data.growTotal = data.timer;
        data.bounceAge = 0;
        data.bounceStrength = 0;
        data.vy = 0;
        tile.visible = true;
        tile.position.y = -0.42;
        tile.rotation.set(0, 0, 0);
        tile.scale.set(0.78, 0.06, 0.78);
        applyColor(tile, takeNextColor());
        sfx('grow', { color: data.color });
      }
    } else if (data.state === 'growing') {
      data.timer -= delta;
      const progress = 1 - Math.max(0, data.timer) / Math.max(0.001, data.growTotal);
      const eased = 1 - Math.pow(1 - Math.min(1, progress), 3);
      const settle = Math.sin(Math.min(1, progress) * Math.PI) * 0.055;
      tile.position.y = -0.42 + eased * 0.42;
      tile.scale.set(0.78 + eased * 0.22 + settle, 0.06 + eased * 0.94 + settle, 0.78 + eased * 0.22 + settle);
      if (tile.position.y <= 0) {
        if (data.timer <= 0) {
          tile.position.y = 0;
          tile.rotation.set(0, 0, 0);
          tile.scale.set(1.06, 0.92, 1.06);
          data.state = 'solid';
          data.timer = 0;
          data.burstTotal = 0;
          data.growTotal = 0;
          state.refillRemaining = Math.max(0, state.refillRemaining - 1);
          refreshHud();
        }
      }
    } else if (data.state === 'solid') {
      tile.position.y = THREE.MathUtils.lerp(tile.position.y, 0, 1 - Math.exp(-12 * delta));
      updateTileBounce(tile, delta);
    }
    if (data.bonus) {
      data.bonus.rotation.x += delta * 1.15;
      data.bonus.rotation.y += delta * 2.2;
      data.bonus.position.y = 1.03 + Math.sin(elapsed * 3 + data.bonus.userData.phase) * 0.12;
    }
  }
  for (const warningId of expiredWarnings) {
    const group = tiles.filter((tile) => tile.userData.state === 'warn' && tile.userData.warningId === warningId);
    explodeGroup(group);
  }
  if (QA_MODE) {
    renderer.domElement.dataset.qaState = JSON.stringify({
      player: state.currentTile ? [state.currentTile.userData.row, state.currentTile.userData.col] : null,
      colors: tiles.map((tile) => tile.userData.color),
      states: tiles.map((tile) => tile.userData.state),
      score: state.score,
      refill: state.refillRemaining,
      warningTime: LEVELS[state.level].warning,
      hopDuration: HOP_DURATION,
      heldMoveInterval: HELD_MOVE_INTERVAL,
      explosionTiming: EXPLOSION_TIMING
    });
  }
}

function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.userData.life -= delta;
    particle.userData.velocity.y -= 12 * delta;
    particle.position.addScaledVector(particle.userData.velocity, delta);
    particle.rotation.x += delta * 4;
    particle.rotation.y += delta * 3;
    const size = Math.max(0.04, Math.min(1, particle.userData.life));
    particle.scale.setScalar(size);
    particle.material.opacity = Math.min(1, particle.userData.life * 2.4);
    if (particle.userData.life <= 0) {
      scene.remove(particle);
      particle.material.dispose();
      particles.splice(i, 1);
    }
  }
}

function updateShockwaves(delta) {
  for (let i = shockwaves.length - 1; i >= 0; i -= 1) {
    const wave = shockwaves[i];
    wave.userData.delay -= delta;
    if (wave.userData.delay > 0) {
      wave.visible = false;
      continue;
    }
    wave.visible = true;
    wave.userData.life -= delta;
    const progress = 1 - Math.max(0, wave.userData.life) / wave.userData.maxLife;
    wave.scale.setScalar(0.25 + progress * wave.userData.speed);
    wave.material.opacity = (1 - progress) ** 1.6 * 0.9;
    wave.position.y += delta * 0.45;
    if (wave.userData.life <= 0) {
      scene.remove(wave);
      wave.geometry.dispose();
      wave.material.dispose();
      shockwaves.splice(i, 1);
    }
  }
}

function updateWarningBeacon(elapsed) {
  const danger = state.grounded && state.currentTile?.userData.state === 'warn';
  warningBeacon.visible = Boolean(danger);
  if (!danger) return;
  warningBeacon.position.set(player.position.x, player.position.y + 2.2 + Math.sin(elapsed * 8) * 0.08, player.position.z);
  warningBeacon.rotation.y += 0.06;
  warningRing.scale.setScalar(1 + Math.sin(elapsed * 8) * 0.08);
}

function beginLevelTransitionWhenSafe() {
  if (!state.pendingLevelComplete || state.transitionTimer > 0 || state.over) return;
  const boardBusy = tiles.some((tile) => tile.userData.state !== 'solid');
  if (boardBusy || state.hop || state.falling || !state.grounded) return;
  state.pendingLevelComplete = false;
  state.locked = true;
  state.transitionTimer = 1.2;
  showToast(`第 ${state.level + 1} 层完成`);
  sfx('levelClear');
}

function update(delta, elapsed) {
  if (state.hitStop > 0) {
    state.hitStop = Math.max(0, state.hitStop - delta);
    updateParticles(delta * 0.12);
    updateShockwaves(delta * 0.12);
    return;
  }
  updateHeldInput();
  let worldUpdated = false;
  if (state.running) {
    state.invulnerable = Math.max(0, state.invulnerable - delta);
    if (!state.respawning) player.visible = state.invulnerable <= 0 || Math.floor(elapsed * 12) % 2 === 0;
    if (!state.locked && !state.pendingLevelComplete) state.time -= delta;
    const secondsLeft = Math.ceil(state.time);
    if (secondsLeft > 0 && secondsLeft <= 5 && state.lastTimeCue !== secondsLeft) {
      state.lastTimeCue = secondsLeft;
      sfx('countdown', { second: secondsLeft });
    }
    if (state.time <= 0) finish(false, '时间到了', 'timeout');
    if (state.running && state.transitionTimer > 0) {
      state.transitionTimer -= delta;
      if (state.transitionTimer <= 0) {
        if (state.level === LEVELS.length - 1) finish(true);
        else startLevel(state.level + 1);
      }
    }
    if (state.running) {
      updatePlayer(delta, elapsed);
      updateTiles(delta, elapsed);
      beginLevelTransitionWhenSafe();
      updateWarningBeacon(elapsed);
      updateMusic();
      refreshHud();
      worldUpdated = true;
    }
  }
  if (state.over && !worldUpdated) {
    updatePlayer(delta, elapsed);
    updateTiles(delta, elapsed);
    warningBeacon.visible = false;
  }
  updateParticles(delta);
  updateShockwaves(delta);
  const shadowY = state.currentTile?.position.y ?? -0.45;
  playerShadow.position.set(player.position.x, shadowY + 0.43, player.position.z);
  playerShadow.material.opacity = state.falling ? 0 : Math.max(0.05, 0.28 - Math.max(0, player.position.y - shadowY) * 0.045);
}

const cameraTarget = new THREE.Vector3(0, -0.1, 0);
function updateCamera(delta) {
  const compact = innerWidth < 760;
  const targetFov = compact ? 49 : 43;
  if (camera.fov !== targetFov) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }
  const distance = compact
    ? 18 / Math.min(camera.aspect, 1)
    : camera.aspect < 1
      ? 23
      : camera.aspect < 1.2
        ? 20.5
        : 18.2;
  const direction = new THREE.Vector3(0.4, 1.55, 1.09).normalize().multiplyScalar(distance);
  const desired = cameraTarget.clone().add(direction);
  if (state.shake > 0) {
    desired.x += (Math.random() - 0.5) * state.shake;
    desired.y += (Math.random() - 0.5) * state.shake;
    desired.z += (Math.random() - 0.5) * state.shake;
    state.shake = Math.max(0, state.shake - delta * 1.4);
  }
  camera.position.lerp(desired, 1 - Math.exp(-7 * delta));
  camera.lookAt(cameraTarget);
}

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const delta = Math.min(clock.getDelta(), 0.034);
  const elapsed = clock.elapsedTime;
  update(delta, elapsed);
  updateCamera(delta);
  renderer.render(scene, camera);
}
loop();

$('#start').addEventListener('click', reset);
$('#restart').addEventListener('click', reset);
$('#sound').addEventListener('click', (event) => {
  state.sound = !state.sound;
  if (state.sound) {
    ensureAudio();
    if (state.running) startMusic();
    sfx('toggle');
  } else {
    stopMusic();
  }
  syncAudioState();
});
addEventListener('pointerdown', () => {
  if (state.sound && state.audio?.state === 'suspended') state.audio.resume();
}, { passive: true });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.__bounceGrid = {
  getState: () => ({
    level: state.level + 1,
    score: state.score,
    combo: state.combo,
    goal: LEVELS[state.level].goal,
    levels: LEVELS.length,
    difficulty: LEVELS[state.level].difficulty,
    warningTime: LEVELS[state.level].warning,
    hopDuration: HOP_DURATION,
    heldMoveInterval: HELD_MOVE_INTERVAL,
    explosionTiming: { ...EXPLOSION_TIMING },
    time: state.time,
    lives: state.lives,
    refill: state.refillRemaining,
    respawning: state.respawning,
    invulnerable: state.invulnerable,
    sound: state.sound,
    inputMode: innerWidth <= 900 ? 'swipe' : 'keyboard-click-or-swipe',
    audioState: state.audio?.state ?? 'not-started',
    musicStyle: 'airy-toybox-offbeat',
    audioMix: 'character-priority',
    musicTempo: MUSIC_TEMPO,
    musicStep: state.musicStep,
    recentAudioEvents: state.audioEvents.slice(-12),
    characterMode: 'procedural-low-poly-3d',
    matchRule: 'orthogonal-connected-4',
    player: state.currentTile ? [state.currentTile.userData.row, state.currentTile.userData.col] : null,
    tileStates: tiles.reduce((counts, tile) => {
      counts[tile.userData.state] = (counts[tile.userData.state] || 0) + 1;
      return counts;
    }, {})
  })
};
syncAudioState();
