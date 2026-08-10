import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EXPLOSION_TIMING, LEVELS, REWARD_TILE_THRESHOLDS, TILES_PER_ROUND, TILE_COLORS, rewardRankForTileCount, roundsForTileCount } from './game-config.mjs?v=83';
import { orthogonalComponent } from './game-rules.mjs?v=83';

const $ = (selector) => document.querySelector(selector);
const QA_MODE = new URLSearchParams(location.search).has('qa');

const ui = {
  intro: $('#intro'), result: $('#result'), level: $('#level'), score: $('#score'),
  timer: $('#timer'), rounds: $('#combo'), roundGoal: $('#goal'), lives: $('#lives'),
  next: $('#next'), toast: $('#toast')
};

const tutorialUi = {
  root: $('#tutorial'), visual: $('#tutorialVisual'), close: $('#tutorialClose'),
  previous: $('#tutorialPrev'), next: $('#tutorialNext'),
  kicker: $('#tutorialKicker'), title: $('#tutorialTitle'), text: $('#tutorialText'),
  dots: [...document.querySelectorAll('.tutorial-progress i')],
  scenes: [...document.querySelectorAll('[data-tutorial-step]')]
};
const TUTORIAL_STEPS = [
  { title: '滑动跳跃', text: '向上下左右滑动，让角色跳到相邻方块。' },
  { title: '连成四格', text: '踩过方块改变颜色，连接四个以上同色方块。' },
  { title: '及时撤离', text: '方块闪烁时继续扩大片区，并在塌陷前跳到安全格。' }
];
const TUTORIAL_STORAGE_KEY = 'happy-jump-mobile-tutorial-v2';
const TUTORIAL_QUERY = new URLSearchParams(location.search).get('tutorial');
let tutorialStep = 0;
let tutorialPointerStart = null;
let tutorialLockBeforeShow = false;
let tutorialPending = true;

function hasSeenTutorial() {
  try { return localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'done'; }
  catch { return false; }
}

function rememberTutorial() {
  try { localStorage.setItem(TUTORIAL_STORAGE_KEY, 'done'); }
  catch { /* Storage can be unavailable in private browsing. */ }
}

function isMobileTutorialVisit() {
  if (TUTORIAL_QUERY === '1') return true;
  if (TUTORIAL_QUERY === '0') return false;
  return innerWidth <= 900 && (innerWidth <= 600 || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches);
}

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialStep];
  tutorialUi.visual.dataset.step = String(tutorialStep);
  tutorialUi.kicker.textContent = `${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`;
  tutorialUi.title.textContent = step.title;
  tutorialUi.text.textContent = step.text;
  tutorialUi.dots.forEach((dot, index) => dot.classList.toggle('active', index === tutorialStep));
  tutorialUi.scenes.forEach((scene, index) => scene.setAttribute('aria-hidden', index === tutorialStep ? 'false' : 'true'));
  tutorialUi.previous.disabled = tutorialStep === 0;
  tutorialUi.next.querySelector('span').textContent = tutorialStep === TUTORIAL_STEPS.length - 1 ? '✓' : '›';
  tutorialUi.next.setAttribute('aria-label', tutorialStep === TUTORIAL_STEPS.length - 1 ? '完成新手引导' : '下一步');
  tutorialUi.next.title = tutorialStep === TUTORIAL_STEPS.length - 1 ? '完成新手引导' : '下一步';
}

function showTutorial() {
  tutorialStep = 0;
  tutorialLockBeforeShow = state.locked;
  state.locked = true;
  state.queuedMove = null;
  pointerStart = null;
  swipePad.classList.remove('show');
  tutorialUi.root.hidden = false;
  tutorialUi.root.classList.add('show');
  renderTutorialStep();
  tutorialUi.next.focus({ preventScroll: true });
}

function dismissTutorial() {
  rememberTutorial();
  tutorialUi.root.classList.remove('show');
  tutorialUi.root.hidden = true;
  tutorialPointerStart = null;
  if (state.running && !state.over) state.locked = tutorialLockBeforeShow;
}

function setTutorialStep(nextStep) {
  tutorialStep = Math.max(0, Math.min(2, nextStep));
  renderTutorialStep();
}

tutorialUi.close.addEventListener('click', dismissTutorial);
tutorialUi.previous.addEventListener('click', () => setTutorialStep(tutorialStep - 1));
tutorialUi.next.addEventListener('click', () => {
  if (tutorialStep === TUTORIAL_STEPS.length - 1) dismissTutorial();
  else setTutorialStep(tutorialStep + 1);
});
tutorialUi.visual.addEventListener('pointerdown', (event) => {
  tutorialPointerStart = { id: event.pointerId, x: event.clientX };
  tutorialUi.visual.setPointerCapture?.(event.pointerId);
});
tutorialUi.visual.addEventListener('pointerup', (event) => {
  if (!tutorialPointerStart || tutorialPointerStart.id !== event.pointerId) return;
  const delta = event.clientX - tutorialPointerStart.x;
  tutorialPointerStart = null;
  if (Math.abs(delta) >= 36) setTutorialStep(tutorialStep + (delta < 0 ? 1 : -1));
});
tutorialUi.visual.addEventListener('pointercancel', () => { tutorialPointerStart = null; });
addEventListener('keydown', (event) => {
  if (!tutorialUi.root.classList.contains('show')) return;
  if (event.key === 'Escape') dismissTutorial();
  if (event.key === 'ArrowLeft') setTutorialStep(tutorialStep - 1);
  if (event.key === 'ArrowRight') tutorialStep === TUTORIAL_STEPS.length - 1 ? dismissTutorial() : setTutorialStep(tutorialStep + 1);
});

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
const HOP_ANTICIPATION = 0.11;
const HOP_FLIGHT_END = 0.88;
const HOP_HEIGHT = 1.5;
const HELD_MOVE_INTERVAL = 235;
const MOBILE_CAMERA_DISTANCE = 15.6;
const MOBILE_CAMERA_TARGET_X = -0.38;
const JUMP_LYRIC_FILES = [
  'assets/audio/jump-lyrics/01-wo.wav',
  'assets/audio/jump-lyrics/02-shi.wav',
  'assets/audio/jump-lyrics/03-yi.wav',
  'assets/audio/jump-lyrics/04-ke.wav',
  'assets/audio/jump-lyrics/05-xiao.wav',
  'assets/audio/jump-lyrics/06-ping.wav',
  'assets/audio/jump-lyrics/07-guo.wav',
  'assets/audio/jump-lyrics/08-jiu.wav',
  'assets/audio/jump-lyrics/09-ai.wav',
  'assets/audio/jump-lyrics/10-tiao.wav',
  'assets/audio/jump-lyrics/11-tiao.wav',
  'assets/audio/jump-lyrics/12-le.wav'
];
const JUMP_LYRIC_TEXT = ['我', '是', '一', '颗', '小', '苹', '果', '就', '爱', '跳', '跳', '乐'];
const JUMP_LYRIC_PHRASE = JUMP_LYRIC_TEXT.join('');
const JUMP_LYRIC_RESET_GAP = 900;
const JUMP_LYRIC_BUS_GAIN = 0.7;
const MIX_AUDIO_FILES = Object.freeze({
  bgm: 'assets/audio/mix-v83/happyjump-bgm-airy-loop.wav',
  levelClear: 'assets/audio/mix-v83/happyjump-level-clear.wav',
  fullClear: 'assets/audio/mix-v83/happyjump-full-clear.wav',
  lifeLost: 'assets/audio/mix-v83/happyjump-life-lost.wav',
  gameOver: 'assets/audio/mix-v83/happyjump-game-over.wav',
  timeout: 'assets/audio/mix-v83/happyjump-timeout.wav'
});
const MIX_CUE_GAINS = Object.freeze({ levelClear: 0.46, fullClear: 0.48, lifeLost: 0.38, gameOver: 0.42, timeout: 0.4 });
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
const platformRadius = (boardSpan + 0.34) / Math.SQRT2;
const island = new THREE.Mesh(
  new THREE.CylinderGeometry(platformRadius - 0.08, 5.65, 3.8, 4, 2, false),
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
  new THREE.CylinderGeometry(platformRadius, platformRadius - 0.16, 0.28, 4, 1, false),
  lowPolyMaterial(0xe0b75f)
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

function connectedMatch(start, includeWarning = false, includeBursting = false) {
  if (!start) return [];
  const states = tiles.map((tile) => tile.userData.state);
  const colors = tiles.map((tile) => tile.userData.color);
  const startIndex = start.userData.row * BOARD + start.userData.col;
  const allowedStates = ['solid'];
  if (includeWarning) allowedStates.push('warn');
  if (includeBursting) allowedStates.push('bursting');
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
const jumpLyricFetches = JUMP_LYRIC_FILES.map(async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load jump lyric: ${url}`);
    return { data: await response.arrayBuffer(), error: null };
  } catch (error) {
    return { data: null, error };
  }
});
const mixAudioFetches = Object.entries(MIX_AUDIO_FILES).map(async ([name, url]) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load mix audio: ${url}`);
    return { name, data: await response.arrayBuffer(), error: null };
  } catch (error) {
    return { name, data: null, error };
  }
});

const state = {
  running: false,
  over: false,
  locked: false,
  level: 0,
  score: 0,
  rounds: 0,
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
  pendingRewards: new Map(),
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
  lyricBus: null,
  musicBus: null,
  musicFilter: null,
  noiseBuffer: null,
  musicNext: 0,
  musicStep: 0,
  musicSource: null,
  mixAudioBuffers: {},
  mixAudioLoad: null,
  mixAudioStatus: 'not-started',
  activeMixSources: new Set(),
  lastTimeCue: null,
  landingAge: 0,
  landingStrength: 0,
  jumpLyricBuffers: [],
  jumpLyricLoad: null,
  jumpLyricIndex: 0,
  jumpLyricLastAt: -Infinity,
  activeJumpLyricSource: null,
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

    state.lyricBus = state.audio.createGain();
    state.lyricBus.gain.value = JUMP_LYRIC_BUS_GAIN;
    state.lyricBus.connect(compressor);

    state.musicBus = state.audio.createGain();
    state.musicBus.gain.value = MUSIC_BUS_GAIN;
    state.musicFilter = state.audio.createBiquadFilter();
    state.musicFilter.type = 'highpass';
    state.musicFilter.frequency.value = 210;
    state.musicFilter.Q.value = 0.45;
    state.musicBus.connect(state.musicFilter).connect(compressor);
  }
  loadJumpLyrics(state.audio);
  loadMixAudio(state.audio);
  if (state.audio.state === 'suspended') state.audio.resume();
  return state.audio;
}

function syncJumpLyricState(status = null) {
  document.documentElement.dataset.jumpLyrics = status
    ?? (state.jumpLyricBuffers.length === JUMP_LYRIC_FILES.length ? 'ready' : state.jumpLyricLoad ? 'loading' : 'not-started');
  document.documentElement.dataset.jumpLyricLoaded = String(state.jumpLyricBuffers.filter(Boolean).length);
  document.documentElement.dataset.jumpLyricNext = JUMP_LYRIC_TEXT[state.jumpLyricIndex] ?? JUMP_LYRIC_TEXT[0];
  document.documentElement.dataset.jumpLyricPhrase = JUMP_LYRIC_PHRASE;
}

function loadJumpLyrics(context) {
  if (state.jumpLyricLoad) return state.jumpLyricLoad;
  syncJumpLyricState('loading');
  state.jumpLyricLoad = Promise.all(jumpLyricFetches)
    .then((files) => {
      const failed = files.find(({ error }) => error);
      if (failed) throw failed.error;
      return Promise.all(files.map(({ data }) => context.decodeAudioData(data.slice(0))));
    })
    .then((buffers) => {
      state.jumpLyricBuffers = buffers;
      syncJumpLyricState('ready');
      return buffers;
    })
    .catch((error) => {
      console.warn('Jump lyric audio could not be loaded; using synthesized bounce sounds.', error);
      state.jumpLyricBuffers = [];
      syncJumpLyricState('fallback');
      return [];
    });
  return state.jumpLyricLoad;
}

function loadMixAudio(context) {
  if (state.mixAudioLoad) return state.mixAudioLoad;
  state.mixAudioStatus = 'loading';
  state.mixAudioLoad = Promise.all(mixAudioFetches)
    .then(async (files) => {
      const decoded = await Promise.all(files.map(async ({ name, data, error }) => {
        if (error || !data) return [name, null];
        try { return [name, await context.decodeAudioData(data.slice(0))]; }
        catch (decodeError) {
          console.warn(`Mix audio could not be decoded: ${name}`, decodeError);
          return [name, null];
        }
      }));
      state.mixAudioBuffers = Object.fromEntries(decoded);
      state.mixAudioStatus = state.mixAudioBuffers.bgm ? 'ready' : 'fallback';
      if (state.sound && state.running && !state.musicSource && state.mixAudioBuffers.bgm) startSampledMusic();
      syncAudioState();
      return state.mixAudioBuffers;
    })
    .catch((error) => {
      console.warn('Generated mix audio could not be loaded; using the beatless synthesized fallback.', error);
      state.mixAudioBuffers = {};
      state.mixAudioStatus = 'fallback';
      syncAudioState();
      return {};
    });
  return state.mixAudioLoad;
}

function playMixCue(name, { delay = 0, playbackRate = 1 } = {}) {
  const buffer = state.mixAudioBuffers[name];
  if (!state.sound || !buffer) return false;
  const context = ensureAudio();
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  gain.gain.value = MIX_CUE_GAINS[name] ?? 0.42;
  source.connect(gain).connect(state.sfxBus ?? state.audioOutput);
  state.activeMixSources.add(source);
  source.onended = () => {
    state.activeMixSources.delete(source);
    source.disconnect();
    gain.disconnect();
  };
  source.start(context.currentTime + delay);
  state.audioEvents.push({ name: 'sampleCue', cue: name, at: Math.round(performance.now() + delay * 1000) });
  if (state.audioEvents.length > 32) state.audioEvents.shift();
  return true;
}

function stopMixCues() {
  for (const source of state.activeMixSources) {
    try { source.stop(); }
    catch { /* The source may already have ended. */ }
    source.disconnect();
  }
  state.activeMixSources.clear();
}

function startSampledMusic() {
  const buffer = state.mixAudioBuffers.bgm;
  if (!state.sound || !buffer || state.musicSource) return false;
  const source = state.audio.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = 0;
  source.loopEnd = buffer.duration;
  source.connect(state.musicBus);
  source.onended = () => {
    if (state.musicSource === source) state.musicSource = null;
    source.disconnect();
  };
  source.start();
  state.musicSource = source;
  state.audioEvents.push({ name: 'musicStart', style: 'airy-beatless-sample', at: Math.round(performance.now()) });
  if (state.audioEvents.length > 32) state.audioEvents.shift();
  return true;
}

function stopJumpLyric() {
  if (!state.activeJumpLyricSource) return;
  try { state.activeJumpLyricSource.stop(); }
  catch { /* The source may already have ended. */ }
  state.activeJumpLyricSource.disconnect();
  state.activeJumpLyricSource = null;
}

function resetJumpLyricPhrase() {
  stopJumpLyric();
  state.jumpLyricIndex = 0;
  state.jumpLyricLastAt = -Infinity;
  syncJumpLyricState();
}

function playJumpLyric() {
  if (!state.sound) return false;
  const context = ensureAudio();
  if (state.jumpLyricBuffers.length !== JUMP_LYRIC_FILES.length || !state.lyricBus) return false;

  const now = performance.now();
  if (now - state.jumpLyricLastAt > JUMP_LYRIC_RESET_GAP) state.jumpLyricIndex = 0;
  const index = state.jumpLyricIndex;
  const buffer = state.jumpLyricBuffers[index];
  if (!buffer) return false;

  stopJumpLyric();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(state.lyricBus);
  source.onended = () => {
    if (state.activeJumpLyricSource === source) state.activeJumpLyricSource = null;
    source.disconnect();
  };
  source.start();
  state.activeJumpLyricSource = source;
  state.jumpLyricIndex = (index + 1) % JUMP_LYRIC_TEXT.length;
  state.jumpLyricLastAt = now;
  state.audioEvents.push({ name: 'jumpLyric', lyric: JUMP_LYRIC_TEXT[index], lyricIndex: index, at: Math.round(now) });
  if (state.audioEvents.length > 32) state.audioEvents.shift();
  duckMusic(0.42, 0.28);
  syncJumpLyricState('ready');
  return true;
}

function syncAudioState() {
  document.documentElement.dataset.audioState = state.audio?.state ?? 'not-started';
  document.documentElement.dataset.musicStyle = 'airy-beatless-sample';
  document.documentElement.dataset.musicPulse = 'none';
  document.documentElement.dataset.audioMix = 'lyric-led-character-priority';
  document.documentElement.dataset.mixAudio = state.mixAudioStatus;
  document.documentElement.dataset.mixAudioLoaded = String(Object.values(state.mixAudioBuffers).filter(Boolean).length);
  document.documentElement.dataset.musicTempo = 'free';
  document.documentElement.dataset.musicStep = String(state.musicStep);
  document.documentElement.dataset.sound = String(state.sound);
  syncJumpLyricState();
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
    if (!playJumpLyric()) {
      voice({ from: 310, peak: 545, to: 455, duration: 0.115, volume: 0.026, attack: 0.007 });
      voice({ from: 930, to: 720, duration: 0.052, volume: 0.005, delay: 0.022, type: 'triangle' });
    }
  } else if (name === 'bounce') {
    const note = 326 + (detail.color ?? 0) * 7;
    if (!playJumpLyric()) voice({ from: note, peak: note * 1.48, to: note * 1.22, duration: 0.1, volume: 0.019, attack: 0.006 });
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
    if (!playMixCue('levelClear')) {
      [740, 930, 1175, 1480].forEach((note, index) => voice({ from: note * 0.985, to: note * 1.025, duration: index === 3 ? 0.42 : 0.18, volume: index === 3 ? 0.027 : 0.019, delay: index * 0.105, type: index % 2 ? 'triangle' : 'sine' }));
      noiseSnap(0.09, 0.004, 6400, 0.33);
    }
  } else if (name === 'fall') {
    voice({ from: 680, peak: 760, to: 310, duration: 0.36, volume: 0.021, type: 'sine', attack: 0.025 });
  } else if (name === 'lifeLost' || name === 'lastLife') {
    const delay = detail.delay ?? 0;
    if (!playMixCue('lifeLost', { delay, playbackRate: name === 'lastLife' ? 0.92 : 1 })) {
      voice({ from: 520, to: 390, duration: 0.22, volume: 0.021, delay, type: 'triangle', attack: 0.018 });
      voice({ from: 340, to: name === 'lastLife' ? 205 : 255, duration: 0.3, volume: 0.022, delay: delay + 0.15, type: 'sine', attack: 0.025 });
      noisePuff(0.16, 0.006, 480, delay + 0.13);
    }
  } else if (name === 'countdown') {
    const note = detail.second === 1 ? 1040 : 820;
    voice({ from: note, to: note * 0.965, duration: detail.second === 1 ? 0.15 : 0.085, volume: 0.011, type: 'sine' });
  } else if (name === 'timeout') {
    if (!playMixCue('timeout')) {
      [660, 520, 390].forEach((note, index) => voice({ from: note, to: note * 0.91, duration: index === 2 ? 0.5 : 0.22, volume: 0.024, delay: index * 0.21, type: index === 1 ? 'triangle' : 'sine', attack: 0.025 }));
      noisePuff(0.28, 0.007, 520, 0.38);
    }
  } else if (name === 'gameOver') {
    if (!playMixCue('gameOver')) {
      [520, 415, 330, 247].forEach((note, index) => voice({ from: note * 1.035, to: note, duration: index === 3 ? 0.72 : 0.3, volume: index === 3 ? 0.026 : 0.019, delay: index * 0.19, type: index % 2 ? 'triangle' : 'sine', attack: 0.035 }));
      noisePuff(0.34, 0.006, 410, 0.56);
    }
  } else if (name === 'fullClear') {
    if (!playMixCue('fullClear')) {
      const phrase = [740, 930, 1175, 1397, 1760, 1480, 1976];
      phrase.forEach((note, index) => voice({ from: note * 0.985, to: note * 1.018, duration: index === phrase.length - 1 ? 0.78 : 0.22, volume: index === phrase.length - 1 ? 0.029 : 0.019, delay: index * 0.115, type: index % 3 === 1 ? 'triangle' : 'sine', attack: 0.016 }));
      [0.18, 0.43, 0.7].forEach((delay, index) => noiseSnap(0.1, 0.0045 - index * 0.0005, 6200 + index * 700, delay));
    }
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

const MUSIC_STEP_SECONDS = 0.5;
const MUSIC_LOOKAHEAD = 0.18;
const MUSIC_CHORDS = [
  { pad: 60, notes: [72, 76, 79], bell: 96 },
  { pad: 55, notes: [71, 74, 79], bell: 95 },
  { pad: 57, notes: [72, 76, 81], bell: 96 },
  { pad: 53, notes: [69, 72, 77], bell: 93 }
];

function midiFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function musicChord(at, notes) {
  notes.forEach((note, index) => {
    const frequency = midiFrequency(note);
    voice({
      from: frequency * 1.006,
      to: frequency,
      duration: 3.4,
      volume: 0.0032,
      type: 'sine',
      at: at + index * 0.08,
      destination: state.musicBus,
      attack: 0.65
    });
  });
}

function musicPad(at, note) {
  const frequency = midiFrequency(note);
  voice({
    from: frequency * 1.006,
    to: frequency * 0.997,
    duration: 3.7,
    volume: 0.0045,
    type: 'sine',
    at: at + 0.15,
    destination: state.musicBus,
    attack: 0.85
  });
}

function scheduleMusicStep(step, at) {
  if (step % 8 !== 0) return;
  const chord = MUSIC_CHORDS[Math.floor(step / 8) % MUSIC_CHORDS.length];
  musicPad(at, chord.pad);
  musicChord(at + 0.18, chord.notes);
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
  if (state.musicSource) {
    const source = state.musicSource;
    state.musicSource = null;
    try { source.stop(now + 0.09); }
    catch { /* The source may already have ended. */ }
  }
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
  startSampledMusic();
  syncAudioState();
}

function updateMusic() {
  if (!state.sound || !state.running || !state.audio) return;
  if (state.musicSource || state.mixAudioStatus !== 'fallback') {
    syncAudioState();
    return;
  }
  const now = state.audio.currentTime;
  if (state.musicNext < now - MUSIC_STEP_SECONDS * 2) state.musicNext = now + 0.04;
  let scheduled = 0;
  while (state.musicNext < now + MUSIC_LOOKAHEAD && scheduled < 8) {
    scheduleMusicStep(state.musicStep, state.musicNext);
    state.musicNext += MUSIC_STEP_SECONDS;
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
  ui.rounds.textContent = state.rounds.toString().padStart(2, '0');
  ui.roundGoal.textContent = LEVELS[state.level].roundGoal.toString().padStart(2, '0');
  ui.lives.replaceChildren(...Array.from({ length: MAX_LIVES }, (_, index) => {
    const pip = document.createElement('i');
    pip.classList.toggle('lost', index >= state.lives);
    return pip;
  }));
  ui.lives.setAttribute('aria-label', `剩余${state.lives}条生命`);
  document.documentElement.dataset.gameState = JSON.stringify({
    level: state.level + 1,
    score: state.score,
    rounds: state.rounds,
    roundGoal: LEVELS[state.level].roundGoal,
    tilesPerRound: TILES_PER_ROUND,
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
    musicStyle: 'airy-beatless-sample',
    musicPulse: 'none',
    audioMix: 'lyric-led-character-priority',
    musicTempo: 'free',
    mixAudioStatus: state.mixAudioStatus,
    mixAudioLoaded: Object.values(state.mixAudioBuffers).filter(Boolean).length,
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
  { name: '蓝宝石', value: 320, color: 0x49b9ef, emissive: 0x06476d, geometry: new THREE.IcosahedronGeometry(0.37, 0) },
  { name: '红宝石', value: 520, color: 0xff5e73, emissive: 0x751629, geometry: new THREE.OctahedronGeometry(0.4, 0) },
  { name: '祖母绿', value: 760, color: 0x57cf83, emissive: 0x145f39, geometry: new THREE.DodecahedronGeometry(0.39, 0) },
  { name: '钻石', value: 1050, color: 0xe9ffff, emissive: 0x3899ad, geometry: new THREE.CylinderGeometry(0.42, 0.06, 0.44, 8) },
  { name: '金条', value: 1450, color: 0xffbd35, emissive: 0x8a4e00, geometry: new RoundedBoxGeometry(0.58, 0.24, 0.34, 1, 0.06) }
];

function spawnBonus(rank = 0, tileCount = null) {
  if (!state.running || state.over) return;
  const candidates = tiles.filter((tile) => tile.userData.state === 'solid' && tile !== state.currentTile && !tile.userData.bonus);
  if (!candidates.length) {
    schedule(() => spawnBonus(rank, tileCount), 240);
    return;
  }
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
    rank: BONUS_DEFS.indexOf(definition),
    sourceTiles: tileCount
  };
  tile.add(bonus);
  tile.userData.bonus = bonus;
  if (tileCount != null) showToast(`${tileCount} 格奖励 · ${definition.name}`);
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
  state.rounds = 0;
  state.time = LEVELS[index].time;
  state.locked = false;
  state.transitionTimer = 0;
  state.pendingLevelComplete = false;
  state.lastTimeCue = null;
  state.pendingRewards.clear();
  state.refillRemaining = 0;
  state.chain = 0;
  state.hitStop = 0;
  state.shake = 0;
  state.landingAge = 0;
  state.landingStrength = 0;
  state.respawning = false;
  state.invulnerable = 0;
  resetJumpLyricPhrase();
  state.nextQueue = [];
  fillNextQueue();
  randomizeBoard();
  const startTile = tileAt(3, 3);
  player.position.set(startTile.position.x, PLAYER_BASE, startTile.position.z);
  player.rotation.set(0, Math.PI / 4, 0);
  mascot.rotation.set(0, 0, 0);
  mascot.position.y = 0;
  leaf.rotation.z = -0.2;
  player.visible = true;
  player.scale.set(1, 1, 1);
  state.velocity.set(0, 0, 0);
  state.currentTile = startTile;
  state.grounded = true;
  state.hop = null;
  state.queuedMove = null;
  state.falling = false;
  refreshHud();
  showToast(`第 ${index + 1}/${LEVELS.length} 层 · ${LEVELS[index].name} · ${LEVELS[index].difficulty}`);
  sfx(index === 0 ? 'ready' : 'levelStart', { level: index });
}

function reset() {
  cancelScheduled();
  stopMixCues();
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
  if (tutorialPending && isMobileTutorialVisit() && (TUTORIAL_QUERY === '1' || !hasSeenTutorial())) {
    tutorialPending = false;
    showTutorial();
  }
}

function finish(win, reason = '', outcome = 'gameOver') {
  if (state.over) return;
  cancelScheduled();
  state.running = false;
  state.over = true;
  state.locked = true;
  state.queuedMove = null;
  pointerStart = null;
  stopJumpLyric();
  stopMixCues();
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
    duration: HOP_DURATION,
    fromScale: player.scale.clone()
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
  const group = connectedMatch(tile, true, true);
  const bursting = group.filter((member) => member.userData.state === 'bursting');
  if (bursting.length) {
    const added = extendBurstingGroup(group, bursting);
    if (added.length) showToast(`${added.length} 格接入爆破 · 继续撤离`);
    return added.length ? group : [];
  }
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

function setBurstingTile(tile, timer, burstIndex, warningId, chainDepth) {
  const data = tile.userData;
  data.state = 'bursting';
  data.warningId = warningId;
  data.chainDepth = chainDepth;
  data.timer = timer;
  data.burstTotal = timer;
  data.burstIndex = burstIndex;
  data.bounceStrength = 0;
  data.mainMat.emissive.setHex(0xffd75e);
  data.topMat.emissive.setHex(0xffffff);
  data.mainMat.emissiveIntensity = 1.1;
  data.topMat.emissiveIntensity = 1.55;
}

function extendBurstingGroup(group, bursting) {
  const added = group.filter((member) => member.userData.state === 'solid' || member.userData.state === 'warn');
  if (!added.length) return [];
  const chainDepth = Math.max(...bursting.map((member) => member.userData.chainDepth || 0));
  const warningId = bursting[0].userData.warningId;
  const pendingReward = state.pendingRewards.get(warningId);
  if (pendingReward) pendingReward.tileCount += added.length;
  else state.pendingRewards.set(warningId, { tileCount: bursting.filter((member) => member.userData.warningId === warningId).length + added.length });
  const nextBurstIndex = Math.max(...bursting.map((member) => member.userData.burstIndex || 0)) + 1;
  const activeRemaining = Math.max(...bursting.map((member) => Math.max(0, member.userData.timer)));
  const escapeWindow = HOP_DURATION + 0.08;
  const firstTimer = Math.max(escapeWindow, activeRemaining + EXPLOSION_TIMING.burstStagger);
  for (const [index, member] of added.entries()) {
    setBurstingTile(
      member,
      firstTimer + index * EXPLOSION_TIMING.burstStagger,
      nextBurstIndex + index,
      warningId,
      chainDepth
    );
  }
  const multiplier = chainDepth + 1;
  const points = added.length * 50 * multiplier;
  state.refillRemaining += added.length;
  state.score += points;
  refreshHud();
  spawnShockwave(added, chainDepth);
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
  leaf.rotation.z = -0.2;
  state.velocity.set(0, 0, 0);
  state.currentTile = tile;
  state.grounded = true;
  state.hop = null;
  state.queuedMove = null;
  state.falling = false;
  state.respawning = false;
  state.invulnerable = 1.35;
  state.landingAge = 0;
  state.landingStrength = 0;
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
    const timer = EXPLOSION_TIMING.burstBase
      + distance * EXPLOSION_TIMING.burstDistance
      + index * EXPLOSION_TIMING.burstStagger;
    setBurstingTile(tile, timer, index, tile.userData.warningId, chainDepth);
  }
  state.pendingRewards.set(group[0].userData.warningId, { tileCount: group.length });
  spawnShockwave(group, chainDepth);
  state.hitStop = Math.min(0.085, 0.052 + chainDepth * 0.009);
  state.shake = Math.min(0.5, 0.16 + group.length * 0.021 + chainDepth * 0.055);
  sfx('explode', { chain: chainDepth + 1, size: group.length });
  if (!state.running) return;
  const multiplier = chainDepth + 1;
  const points = group.length * 50 * multiplier;
  state.chain = multiplier;
  state.refillRemaining += group.length;
  state.score += points;
  refreshHud();
  showToast(chainDepth > 0 ? `连锁 ×${multiplier}  +${points}` : `爆破 +${points}`);

  if (playerCaught) loseLife('被爆炸卷走了', 'blast');
}

function landOn(tile, silent = false) {
  player.position.set(tile.position.x, tile.position.y + PLAYER_BASE, tile.position.z);
  state.currentTile = tile;
  state.grounded = true;
  state.landingAge = 0;
  state.landingStrength = 1.05;
  collectBonus(tile);
  if (tile.userData.state === 'solid') {
    tile.userData.bounceAge = 0;
    tile.userData.bounceStrength = 1.15;
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
    const anticipationProgress = Math.min(1, progress / HOP_ANTICIPATION);
    const flightProgress = THREE.MathUtils.clamp(
      (progress - HOP_ANTICIPATION) / (HOP_FLIGHT_END - HOP_ANTICIPATION),
      0,
      1
    );
    const landingProgress = THREE.MathUtils.clamp(
      (progress - HOP_FLIGHT_END) / (1 - HOP_FLIGHT_END),
      0,
      1
    );
    const anticipationEase = anticipationProgress * anticipationProgress * (3 - 2 * anticipationProgress);
    const travelEase = flightProgress * flightProgress * (3 - 2 * flightProgress);
    const landingEase = landingProgress * landingProgress * (3 - 2 * landingProgress);
    const inFlight = progress >= HOP_ANTICIPATION && progress < HOP_FLIGHT_END;
    const arc = inFlight ? Math.sin(Math.PI * flightProgress) : 0;

    player.position.x = THREE.MathUtils.lerp(hop.fromX, hop.toX, travelEase);
    player.position.z = THREE.MathUtils.lerp(hop.fromZ, hop.toZ, travelEase);
    player.position.y = PLAYER_BASE + arc * HOP_HEIGHT;

    let widthScale;
    let heightScale;
    if (progress < HOP_ANTICIPATION) {
      widthScale = THREE.MathUtils.lerp(hop.fromScale.x, 1.2, anticipationEase);
      heightScale = THREE.MathUtils.lerp(hop.fromScale.y, 0.7, anticipationEase);
    } else if (inFlight) {
      const velocityStretch = Math.abs(Math.cos(Math.PI * flightProgress));
      const flightWidth = 1 - velocityStretch * 0.08 - arc * 0.03;
      const flightHeight = 1 + velocityStretch * 0.18 + arc * 0.08;
      const launchProgress = Math.min(1, flightProgress / 0.22);
      const launchEase = launchProgress * launchProgress * (3 - 2 * launchProgress);
      widthScale = THREE.MathUtils.lerp(1.2, flightWidth, launchEase);
      heightScale = THREE.MathUtils.lerp(0.7, flightHeight, launchEase);
    } else {
      widthScale = THREE.MathUtils.lerp(0.92, 1.2, landingEase);
      heightScale = THREE.MathUtils.lerp(1.18, 0.7, landingEase);
    }
    player.scale.set(widthScale, heightScale, widthScale);
    mascot.position.y = -Math.max(0, 1 - heightScale) * 0.16;
    mascot.rotation.x = -arc * 0.16;
    leaf.rotation.z = -0.2 - arc * 0.18 + landingEase * 0.08;
    if (progress >= 1) {
      state.hop = null;
      player.scale.set(1.2, 0.7, 1.2);
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
    if (state.landingStrength > 0.015) {
      state.landingAge += delta;
      state.landingStrength *= Math.exp(-7.2 * delta);
      const spring = Math.cos(state.landingAge * 25) * state.landingStrength;
      player.scale.set(1 + spring * 0.11, 1 - spring * 0.19, 1 + spring * 0.11);
      mascot.position.y = -Math.max(0, spring) * 0.07;
    } else {
      state.landingStrength = 0;
      const settle = 1 - Math.exp(-18 * delta);
      player.scale.lerp(new THREE.Vector3(1, 1, 1), settle);
      mascot.position.y = Math.sin(elapsed * 3.4) * 0.025;
    }
    mascot.rotation.x = THREE.MathUtils.lerp(mascot.rotation.x, 0, 0.16);
    leaf.rotation.z = THREE.MathUtils.lerp(leaf.rotation.z, -0.2, 1 - Math.exp(-16 * delta));
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
    data.bounceStrength *= Math.exp(-4.2 * delta);
    const wave = Math.cos(data.bounceAge * 19) * data.bounceStrength;
    tile.scale.set(1 + wave * 0.075, 1 - wave * 0.16, 1 + wave * 0.075);
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
        const playerCaught = !state.respawning && state.invulnerable <= 0
          && state.grounded && state.currentTile === tile;
        clearBonus(tile);
        spawnBurst(tile);
        data.state = 'falling';
        data.timer = 0.72 + Math.random() * 0.18;
        data.vy = -2.8 - Math.random() * 1.4;
        data.mainMat.emissiveIntensity = 0;
        data.topMat.emissiveIntensity = 0;
        sfx('tilePop', { index: data.burstIndex, chain: data.chainDepth });
        if (playerCaught) loseLife('被爆破卷走了', 'blast');
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
  for (const [warningId, reward] of state.pendingRewards) {
    const stillBursting = tiles.some((tile) => tile.userData.state === 'bursting' && tile.userData.warningId === warningId);
    if (stillBursting) continue;
    state.pendingRewards.delete(warningId);
    const gainedRounds = roundsForTileCount(reward.tileCount);
    state.rounds += gainedRounds;
    if (state.rounds >= LEVELS[state.level].roundGoal) state.pendingLevelComplete = true;
    refreshHud();
    showToast(`${reward.tileCount} 格爆破 · +${gainedRounds} 回`);
    const rewardRank = rewardRankForTileCount(reward.tileCount);
    if (rewardRank >= 0) schedule(() => spawnBonus(rewardRank, reward.tileCount), 240);
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
      cameraDistance: Number(camera.position.distanceTo(cameraTarget).toFixed(2)),
      cameraTargetX: Number(cameraTarget.x.toFixed(2)),
      explosionTiming: EXPLOSION_TIMING,
      rewardThresholds: REWARD_TILE_THRESHOLDS
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
  state.transitionTimer = 1.55;
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
  cameraTarget.x = compact ? MOBILE_CAMERA_TARGET_X : 0;
  const targetFov = compact ? 49 : 43;
  if (camera.fov !== targetFov) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }
  const distance = compact
    ? MOBILE_CAMERA_DISTANCE / Math.min(camera.aspect, 1)
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
    stopJumpLyric();
    stopMixCues();
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
  roundsForTileCount,
  getState: () => ({
    level: state.level + 1,
    score: state.score,
    rounds: state.rounds,
    roundGoal: LEVELS[state.level].roundGoal,
    tilesPerRound: TILES_PER_ROUND,
    levels: LEVELS.length,
    difficulty: LEVELS[state.level].difficulty,
    warningTime: LEVELS[state.level].warning,
    hopDuration: HOP_DURATION,
    heldMoveInterval: HELD_MOVE_INTERVAL,
    mobileCameraDistance: MOBILE_CAMERA_DISTANCE,
    mobileCameraTargetX: MOBILE_CAMERA_TARGET_X,
    explosionTiming: { ...EXPLOSION_TIMING },
    rewardThresholds: [...REWARD_TILE_THRESHOLDS],
    pendingRewards: [...state.pendingRewards.values()].map(({ tileCount }) => tileCount),
    time: state.time,
    lives: state.lives,
    refill: state.refillRemaining,
    respawning: state.respawning,
    invulnerable: state.invulnerable,
    sound: state.sound,
    inputMode: innerWidth <= 900 ? 'swipe' : 'keyboard-click-or-swipe',
    audioState: state.audio?.state ?? 'not-started',
    musicStyle: 'airy-beatless-sample',
    musicPulse: 'none',
    audioMix: 'lyric-led-character-priority',
    musicTempo: 'free',
    mixAudioStatus: state.mixAudioStatus,
    mixAudioLoaded: Object.values(state.mixAudioBuffers).filter(Boolean).length,
    musicStep: state.musicStep,
    jumpLyricLoaded: state.jumpLyricBuffers.filter(Boolean).length,
    jumpLyricNextIndex: state.jumpLyricIndex,
    jumpLyricNext: JUMP_LYRIC_TEXT[state.jumpLyricIndex],
    jumpLyricPhrase: JUMP_LYRIC_PHRASE,
    jumpLyricResetGap: JUMP_LYRIC_RESET_GAP,
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
