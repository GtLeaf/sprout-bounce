import * as THREE from '../../vendor/three/three.module.js';
import config from './config.js';
import leaderboardModule from './cloud-leaderboard.js';
import { height, nativeCanvas, ratio, width } from './mini-shim.mjs';

const { WechatLeaderboard } = leaderboardModule;
const wxApi = globalThis.wx;
const document = globalThis.__happyJumpPlatform.document;
const board = globalThis.__bounceGrid;
const cloud = new WechatLeaderboard(wxApi, config);
const deviceInfo = wxApi.getDeviceInfo?.() || wxApi.getSystemInfoSync?.() || {};
const isDevtools = deviceInfo.platform === 'devtools' || deviceInfo.brand === 'devtools';
const DEVTOOLS_STATE_KEY = 'happy-jump-devtools-state-v1';
const uiCanvas = wxApi.createCanvas();
uiCanvas.width = Math.max(1, Math.floor(width * ratio));
uiCanvas.height = Math.max(1, Math.floor(height * ratio));
const context = uiCanvas.getContext('2d');
context.scale(ratio, ratio);

const COLORS = ['#f69d46', '#f6d14e', '#7acd5a', '#42b4df', '#c982d7', '#f06b70'];
const THEME = Object.freeze({
  paper: '#f5f1e7', ink: '#4d4a45', muted: '#79756e',
  aqua: '#53a895', aquaDark: '#397f70', warm: '#e4ce8b', alert: '#c97762'
});
const LOCAL_BEST_KEY = 'happy-jump-wechat-local-best-v2';
const art = {};
const buttons = {};
const leaderboardState = {
  status: '正在登录微信账号',
  player: { displayName: '微信玩家', bestScore: Number(wxApi.getStorageSync(LOCAL_BEST_KEY)) || 0, bestLevel: 1 },
  entries: [],
  rank: null
};

let latestState = null;
let latestLevels = [];
let previousOver = false;
let manualScreen = null;
let previousScreen = 'home';
let touch = null;
let overlay = null;
let texture = null;
let lastSignature = '';
let lastDraw = 0;
let userInfoButton = null;
let touchDebug = null;

function loadArt(name, source) {
  const image = wxApi.createImage();
  image.onload = () => {
    art[name] = image;
    lastSignature = '';
  };
  image.onerror = () => { art[name] = null; };
  image.src = source;
}

loadArt('keyArt', 'assets/sprout-keyart-mobile.jpg');
loadArt('logo', 'assets/happy-jump-logo.png');
loadArt('forward', 'assets/ui-forward.png');
loadArt('soundOn', 'assets/ui-sound-on.png');
loadArt('soundOff', 'assets/ui-sound-off.png');
loadArt('paper', 'assets/sprout-ui-paper.jpg');

function roundRect(ctx, x, y, w, h, radius = 8) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRect(x, y, w, h, color, radius = 8) {
  context.fillStyle = color;
  roundRect(context, x, y, w, h, radius);
  context.fill();
}

function strokeRect(x, y, w, h, color, radius = 8, lineWidth = 1) {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  roundRect(context, x, y, w, h, radius);
  context.stroke();
}

function panel(x, y, w, h, color = 'rgba(245,241,231,0.96)', radius = 8) {
  fillRect(x, y, w, h, color, radius);
  if (!art.paper) return;
  context.save();
  roundRect(context, x, y, w, h, radius);
  context.clip();
  context.globalAlpha = 0.12;
  context.drawImage(art.paper, x, y, w, h);
  context.restore();
}

function text(value, x, y, size, color = '#173b52', align = 'left', weight = '400') {
  context.save();
  context.fillStyle = color;
  context.font = `${weight} ${size}px sans-serif`;
  context.textAlign = align;
  context.textBaseline = 'middle';
  context.fillText(String(value), x, y);
  context.restore();
}

function button(name, label, x, y, w, h, primary = false, icon = null) {
  fillRect(x, y, w, h, primary ? THEME.aqua : 'rgba(245,241,231,0.96)', h / 2);
  strokeRect(x, y, w, h, primary ? THEME.aquaDark : '#b8d6cd', h / 2);
  const iconSize = icon ? Math.min(24, h * 0.46) : 0;
  const center = x + w / 2 - iconSize * 0.22;
  text(label, center, y + h / 2 + 1, primary ? 18 : 15, primary ? '#fffdf8' : THEME.ink, 'center', '700');
  if (icon) context.drawImage(icon, center + Math.min(76, w * 0.23), y + (h - iconSize) / 2, iconSize, iconSize);
  buttons[name] = { x, y, w, h };
}

function inside(point, rect) {
  return Boolean(point && rect && point.x >= rect.x && point.x <= rect.x + rect.w
    && point.y >= rect.y && point.y <= rect.y + rect.h);
}

function drawBrand(y = 44) {
  if (art.logo) {
    const logoWidth = Math.min(width * 0.48, 205);
    const logoHeight = logoWidth * 580 / 993;
    context.drawImage(art.logo, 18, y, logoWidth, logoHeight);
    return;
  }
  text('HAPPY JUMP', width / 2, y + 22, Math.min(34, width * 0.09), '#ffffff', 'center', '700');
}

function screenForState(state = latestState) {
  if (document.querySelector('#tutorial').classList.contains('show')) return 'tutorial';
  if (manualScreen) return manualScreen;
  if (!state) return 'home';
  if (state.over) return 'result';
  if (state.levelResultOpen) return 'levelResult';
  return state.running ? 'game' : 'home';
}

function drawHome() {
  context.fillStyle = '#4edfeb';
  context.fillRect(0, 0, width, height);
  const artHeight = Math.min(height * 0.61, width * 1050 / 900);
  if (art.keyArt) context.drawImage(art.keyArt, 0, 0, width, artHeight);
  const fade = context.createLinearGradient(0, artHeight * 0.72, 0, artHeight + 20);
  fade.addColorStop(0, 'rgba(78,223,235,0)');
  fade.addColorStop(1, '#4edfeb');
  context.fillStyle = fade;
  context.fillRect(0, artHeight * 0.7, width, artHeight * 0.3 + 22);
  drawBrand(Math.max(28, height * 0.045));

  const x = 16;
  const w = width - 32;
  const h = Math.min(286, Math.max(250, height * 0.34));
  const y = height - h - 18;
  panel(x, y, w, h, 'rgba(245,241,231,0.97)', 26);
  text(leaderboardState.player.displayName || '微信玩家', x + 20, y + 28, 17, THEME.ink, 'left', '700');
  text(leaderboardState.status, x + 20, y + 51, 11, THEME.muted);

  context.strokeStyle = '#d7ebe4';
  context.beginPath();
  context.moveTo(x + 20, y + 67);
  context.lineTo(x + w - 20, y + 67);
  context.stroke();
  text('历史最佳', x + 20, y + 87, 11, THEME.muted);
  text(leaderboardState.player.bestScore || 0, x + 20, y + 116, 26, THEME.ink, 'left', '700');
  text('我的排名', x + w / 2 + 8, y + 87, 11, THEME.muted);
  text(leaderboardState.rank ? `第 ${leaderboardState.rank} 名` : '暂无', x + w / 2 + 8, y + 116, 21, THEME.aquaDark, 'left', '700');

  button('start', '开始挑战', x + 18, y + h - 105, w - 36, 49, true, art.forward);
  button('leaderboard', '全球排行榜', x + 18, y + h - 46, w - 36, 34, false);
  syncProfileButton(x + w - 150, y + 14, 132, 28);
}

function drawHud(state, levels) {
  const top = Math.max(10, Number(wxApi.getMenuButtonBoundingClientRect?.()?.bottom || 0) + 5);
  const x = 10;
  const w = width - 20;
  panel(x, top, w, 82, 'rgba(245,241,231,0.92)', 24);
  const positions = [x + w * 0.12, x + w * 0.37, x + w * 0.63, x + w * 0.85];
  const labels = ['层数', '分数', '爆破回合', '时间'];
  const values = [`${state.level}/${state.levels}`, state.score, `${state.rounds}/${state.roundGoal}`, Math.max(0, Math.ceil(state.time))];
  positions.forEach((position, index) => {
    text(labels[index], position, top + 19, 10, THEME.muted, 'center');
    text(values[index], position, top + 44, index === 1 ? 16 : 17, index === 3 && state.time <= 10 ? THEME.alert : THEME.ink, 'center', '700');
  });
  text(levels[state.level - 1]?.name || `第 ${state.level} 层`, x + 16, top + 67, 11, '#2d7466', 'left', '700');
  for (let life = 0; life < 3; life += 1) {
    context.fillStyle = life < state.lives ? THEME.alert : '#d7dfdc';
    context.beginPath();
    context.arc(x + w - 68 + life * 17, top + 67, 5, 0, Math.PI * 2);
    context.fill();
  }
  const queue = Array.isArray(state.nextQueue) ? state.nextQueue : [];
  queue.slice(0, 4).forEach((color, index) => fillRect(x + 16 + index * 17, top + 58, 11, 11, COLORS[color] || '#ffffff', 3));

  const soundX = width - 49;
  const soundY = top + 91;
  panel(soundX, soundY, 39, 39, 'rgba(245,241,231,0.92)', 20);
  const soundArt = state.sound ? art.soundOn : art.soundOff;
  if (soundArt) context.drawImage(soundArt, soundX + 8, soundY + 8, 23, 23);
  else text(state.sound ? '♪' : '×', soundX + 19.5, soundY + 20, 21, '#245f54', 'center', '700');
  buttons.sound = { x: soundX, y: soundY, w: 39, h: 39 };
  hideProfileButton();
}

function drawToast() {
  const toast = document.querySelector('#toast');
  if (!toast.classList.contains('show') || !toast.textContent) return;
  const w = Math.min(width - 40, Math.max(180, toast.textContent.length * 14 + 38));
  const y = height - 78;
  fillRect((width - w) / 2, y - 20, w, 40, 'rgba(20,58,74,0.9)');
  text(toast.textContent, width / 2, y, 13, '#ffffff', 'center', '700');
}

function modalBase() {
  context.fillStyle = 'rgba(17,50,65,0.46)';
  context.fillRect(0, 0, width, height);
  const w = width - 44;
  const x = 22;
  const h = Math.min(404, height - 120);
  const y = (height - h) / 2;
  panel(x, y, w, h, 'rgba(245,241,231,0.98)', 30);
  return { x, y, w, h };
}

function drawLevelResult(state, levels) {
  drawHud(state, levels);
  const { x, y, w, h } = modalBase();
  const final = state.level === state.levels;
  text(final ? '全部关卡完成' : '本关完成', width / 2, y + 38, 12, '#2d7466', 'center', '700');
  text(`第 ${state.level} 层完成`, width / 2, y + 76, 27, THEME.ink, 'center', '700');
  const values = [Math.max(0, state.score), state.levelTilesExploded, `${state.rounds}/${state.roundGoal}`];
  ['总分', '爆破格数', '完成回合'].forEach((label, index) => {
    const column = x + w * (0.18 + index * 0.32);
    text(label, column, y + 132, 11, THEME.muted, 'center');
    text(values[index], column, y + 161, 20, THEME.aquaDark, 'center', '700');
  });
  text(final ? '八层挑战已经完成' : levels[state.level]?.name || '下一层', width / 2, y + 215, 15, '#58746f', 'center');
  button('continue', final ? '查看总成绩' : '进入下一层', x + 22, y + h - 72, w - 44, 50, true);
  hideProfileButton();
}

function drawResult(state) {
  const { x, y, w, h } = modalBase();
  const won = document.querySelector('#resultTag').textContent === '全部通关';
  text(won ? '八层通关' : '挑战结束', width / 2, y + 44, 13, '#2d7466', 'center', '700');
  text(document.querySelector('#resultTitle').textContent || (won ? '方阵大师' : '再接再厉'), width / 2, y + 82, 28, THEME.ink, 'center', '700');
  text(state.score, width / 2, y + 142, 43, THEME.aqua, 'center', '700');
  text('本局得分', width / 2, y + 177, 12, THEME.muted, 'center');
  text(`历史最佳  ${leaderboardState.player.bestScore || state.score}`, width / 2, y + 216, 16, THEME.aquaDark, 'center', '700');
  text(leaderboardState.rank ? `全球第 ${leaderboardState.rank} 名` : leaderboardState.status, width / 2, y + 244, 12, THEME.muted, 'center');
  button('restart', '再玩一次', x + 22, y + h - 116, w - 44, 48, true);
  button('resultLeaderboard', '查看排行榜', x + 22, y + h - 56, w - 44, 38, false);
  hideProfileButton();
}

function drawLeaderboard() {
  context.fillStyle = 'rgba(16,54,68,0.42)';
  context.fillRect(0, 0, width, height);
  drawBrand(45);
  const x = 18;
  const y = 104;
  const w = width - 36;
  const h = height - 124;
  panel(x, y, w, h, 'rgba(245,241,231,0.98)', 28);
  text('全球排行榜', width / 2, y + 34, 22, THEME.ink, 'center', '700');
  const maxRows = Math.max(3, Math.floor((h - 112) / 44));
  const entries = leaderboardState.entries.slice(0, maxRows);
  if (!entries.length) {
    text('还没有云端成绩', width / 2, y + 118, 16, '#58746f', 'center', '700');
    text(leaderboardState.status, width / 2, y + 148, 12, '#718783', 'center');
  }
  entries.forEach((entry, index) => {
    const rowY = y + 76 + index * 44;
    if (index % 2 === 0) fillRect(x + 12, rowY - 18, w - 24, 38, '#edf7f3', 5);
    text(index + 1, x + 34, rowY, 14, index < 3 ? '#d8812e' : '#68817d', 'center', '700');
    text(entry.displayName || '微信玩家', x + 58, rowY, 13, THEME.ink, 'left', '700');
    text(entry.bestScore || 0, x + w - 24, rowY, 15, THEME.aquaDark, 'right', '700');
  });
  button('back', '返回', x + 20, y + h - 50, w - 40, 36, false);
  hideProfileButton();
}

function drawTutorialVisual(step, centerY) {
  if (step === 0) {
    const size = Math.min(156, width * 0.42);
    const x = width / 2;
    panel(x - size / 2, centerY - size / 2, size, size, 'rgba(245,241,231,0.9)', size / 2);
    const directions = [
      ['↑', x, centerY - size * 0.34], ['→', x + size * 0.34, centerY],
      ['↓', x, centerY + size * 0.34], ['←', x - size * 0.34, centerY]
    ];
    directions.forEach(([label, cx, cy]) => {
      fillRect(cx - 18, cy - 18, 36, 36, THEME.aqua, 18);
      text(label, cx, cy, 23, '#fffdf8', 'center', '700');
    });
    fillRect(x - 15, centerY - 15, 30, 30, THEME.alert, 15);
    return;
  }

  const tile = Math.min(54, width * 0.14);
  const gap = 7;
  if (step === 1) {
    const originX = width / 2 - (tile * 3 + gap * 2) / 2;
    const originY = centerY - (tile * 2 + gap) / 2;
    [[1, 0], [0, 1], [1, 1], [2, 1]].forEach(([col, row], index) => {
      fillRect(originX + col * (tile + gap), originY + row * (tile + gap), tile, tile, COLORS[5], 15);
      strokeRect(originX + col * (tile + gap), originY + row * (tile + gap), tile, tile, index === 2 ? '#fff4b4' : '#d45c5f', 15, index === 2 ? 4 : 2);
    });
    return;
  }

  const originX = width / 2 - tile * 1.55;
  const originY = centerY - tile - gap / 2;
  [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([col, row]) => {
    fillRect(originX + col * (tile + gap), originY + row * (tile + gap), tile, tile, '#ef7770', 15);
    strokeRect(originX + col * (tile + gap), originY + row * (tile + gap), tile, tile, '#fff0a8', 15, 3);
  });
  text('→', width / 2 + tile * 0.52, centerY, 34, '#fffdf8', 'center', '700');
  fillRect(width / 2 + tile, centerY - tile / 2, tile, tile, THEME.aqua, 15);
}

function drawTutorial(state, levels) {
  drawHud(state, levels);
  context.fillStyle = 'rgba(29,77,78,0.28)';
  context.fillRect(0, 0, width, height);
  const tutorial = document.querySelector('#tutorial');
  const kicker = document.querySelector('#tutorialKicker').textContent || '1 / 3';
  const title = document.querySelector('#tutorialTitle').textContent || '滑动跳跃';
  const description = document.querySelector('#tutorialText').textContent || '向上下左右滑动，让角色跳到相邻方块。';
  const step = Math.max(0, Math.min(2, Number(kicker.split('/')[0]) - 1 || 0));
  const safeTop = Math.max(14, Number(wxApi.getMenuButtonBoundingClientRect?.()?.bottom || 0) + 10);
  const cardX = 14;
  const cardW = width - 28;
  const cardH = Math.min(192, height * 0.25);
  const cardY = height - cardH - 14;
  drawTutorialVisual(step, safeTop + Math.max(118, (cardY - safeTop) * 0.48));
  panel(cardX, cardY, cardW, cardH, 'rgba(245,241,231,0.98)', 26);
  text(kicker, cardX + 20, cardY + 24, 11, THEME.aqua, 'left', '700');
  text(title, cardX + 20, cardY + 53, 23, THEME.ink, 'left', '700');
  text(description, cardX + 20, cardY + 82, width < 380 ? 12 : 13, THEME.muted, 'left', '500');

  const controlY = cardY + cardH - 38;
  if (!document.querySelector('#tutorialPrev').disabled) {
    fillRect(cardX + 18, controlY - 21, 42, 42, THEME.aqua, 21);
    text('‹', cardX + 39, controlY - 1, 30, '#fffdf8', 'center', '700');
    buttons.tutorialPrev = { x: cardX + 18, y: controlY - 21, w: 42, h: 42 };
  }
  [0, 1, 2].forEach((index) => {
    context.fillStyle = index === step ? THEME.aqua : 'rgba(77,74,69,0.18)';
    context.beginPath();
    context.arc(width / 2 + (index - 1) * 18, controlY, index === step ? 5 : 4, 0, Math.PI * 2);
    context.fill();
  });
  fillRect(cardX + cardW - 60, controlY - 21, 42, 42, THEME.aqua, 21);
  text(step === 2 ? '✓' : '›', cardX + cardW - 39, controlY - 1, step === 2 ? 22 : 30, '#fffdf8', 'center', '700');
  buttons.tutorialNext = { x: cardX + cardW - 60, y: controlY - 21, w: 42, h: 42 };

  const closeY = safeTop + 8;
  fillRect(12, closeY, 38, 38, 'rgba(245,241,231,0.94)', 19);
  text('×', 31, closeY + 18, 25, THEME.ink, 'center', '500');
  buttons.tutorialClose = { x: 12, y: closeY, w: 38, h: 38 };
  hideProfileButton();
  tutorial.hidden = false;
}

function draw(state, levels) {
  Object.keys(buttons).forEach((key) => delete buttons[key]);
  context.clearRect(0, 0, width, height);
  const screen = screenForState(state);
  if (screen === 'home') drawHome();
  else if (screen === 'game') drawHud(state, levels);
  else if (screen === 'tutorial') drawTutorial(state, levels);
  else if (screen === 'levelResult') drawLevelResult(state, levels);
  else if (screen === 'result') drawResult(state);
  else drawLeaderboard();
  if (screen !== 'tutorial') drawToast();
  texture.needsUpdate = true;
}

function writeDevtoolsState(state) {
  if (!isDevtools) return;
  const tutorial = document.querySelector('#tutorial');
  const artState = Object.keys(art).reduce((result, name) => {
    result[name] = art[name] === null ? 'failed' : 'loaded';
    return result;
  }, {});
  try {
    wxApi.setStorageSync(DEVTOOLS_STATE_KEY, {
      ...board.getState(),
      ...board.getDebugState?.(),
      screen: screenForState(state),
      tutorial: tutorial.classList.contains('show') ? {
        step: document.querySelector('#tutorialKicker').textContent,
        title: document.querySelector('#tutorialTitle').textContent
      } : null,
      art: artState,
      buttonNames: Object.keys(buttons),
      buttons: Object.keys(buttons).reduce((result, name) => {
        result[name] = { ...buttons[name] };
        return result;
      }, {}),
      touchDebug,
      overlayReady: Boolean(overlay && texture),
      updatedAt: Date.now()
    });
  } catch { /* Diagnostics must never affect the game loop. */ }
}

function ensureOverlay() {
  if (overlay) return;
  texture = new THREE.CanvasTexture(uiCanvas);
  // WeChat canvases are not DOM canvas instances. r162's sRGB converter
  // otherwise retries an unsupported browser conversion on every HUD update.
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, width, height, 0, -10, 10);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  material.toneMapped = false;
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0.5);
  sprite.position.set(width / 2, height / 2, 0);
  sprite.scale.set(width, height, 1);
  scene.add(sprite);
  overlay = { scene, camera };
}

function updateCloudResult(result) {
  if (result?.player) leaderboardState.player = { ...leaderboardState.player, ...result.player };
  if (Array.isArray(result?.entries)) leaderboardState.entries = result.entries;
  if (Number.isInteger(result?.myRank)) leaderboardState.rank = result.myRank;
  else if (result && Object.prototype.hasOwnProperty.call(result, 'myRank')) leaderboardState.rank = null;
  lastSignature = '';
}

function saveResult(state) {
  if (state.score > leaderboardState.player.bestScore) {
    leaderboardState.player.bestScore = state.score;
    wxApi.setStorageSync(LOCAL_BEST_KEY, state.score);
  }
  const won = document.querySelector('#resultTag').textContent === '全部通关';
  cloud.submitScore({ score: state.score, level: state.level, won })
    .then((result) => {
      updateCloudResult(result);
      leaderboardState.status = '成绩已保存到微信云端';
    })
    .catch(() => { leaderboardState.status = cloud.ready ? '网络恢复后自动补传成绩' : '成绩已保存在本机'; });
}

function openLeaderboard(from) {
  previousScreen = from;
  manualScreen = 'leaderboard';
  lastSignature = '';
  if (!cloud.ready) return;
  leaderboardState.status = '正在刷新排行榜';
  cloud.refresh()
    .then((result) => {
      updateCloudResult(result);
      leaderboardState.status = '排行榜已更新';
    })
    .catch(() => { leaderboardState.status = '排行榜暂时无法刷新'; });
}

function syncProfileButton(x, y, w, h) {
  if (!cloud.ready || screenForState() !== 'home' || !wxApi.createUserInfoButton) {
    hideProfileButton();
    return;
  }
  if (!userInfoButton) {
    userInfoButton = wxApi.createUserInfoButton({
      type: 'text',
      text: leaderboardState.player.avatarUrl ? '更新微信昵称头像' : '使用微信昵称头像',
      withCredentials: true,
      lang: 'zh_CN',
      style: {
        left: x, top: y, width: w, height: h, lineHeight: h,
        backgroundColor: '#e5f3ee', borderColor: '#e5f3ee', borderWidth: 0,
        borderRadius: 8, color: '#245f54', textAlign: 'center', fontSize: 12
      }
    });
    userInfoButton.onTap((result) => {
      if (!result?.cloudID) return;
      cloud.updateAuthorizedProfile(result.cloudID)
        .then((cloudResult) => {
          updateCloudResult(cloudResult);
          leaderboardState.status = '微信昵称头像已更新';
        })
        .catch(() => { leaderboardState.status = '昵称头像更新失败'; });
    });
  } else userInfoButton.show();
}

function hideProfileButton() {
  userInfoButton?.hide();
}

function clickDummy(id) {
  document.querySelector(`#${id}`).dispatchEvent({ type: 'click', currentTarget: document.querySelector(`#${id}`) });
}

function handleTap(point) {
  const screen = screenForState();
  if (screen === 'home') {
    if (inside(point, buttons.start)) clickDummy('start');
    else if (inside(point, buttons.leaderboard)) openLeaderboard('home');
  } else if (screen === 'tutorial') {
    if (inside(point, buttons.tutorialPrev)) clickDummy('tutorialPrev');
    else if (inside(point, buttons.tutorialNext)) clickDummy('tutorialNext');
    else if (inside(point, buttons.tutorialClose)) clickDummy('tutorialClose');
  } else if (screen === 'game' && inside(point, buttons.sound)) clickDummy('sound');
  else if (screen === 'levelResult' && inside(point, buttons.continue)) clickDummy('levelContinue');
  else if (screen === 'result') {
    if (inside(point, buttons.restart)) clickDummy('restart');
    else if (inside(point, buttons.resultLeaderboard)) openLeaderboard('result');
  } else if (screen === 'leaderboard' && inside(point, buttons.back)) {
    manualScreen = null;
    if (previousScreen === 'home' && latestState?.over) clickDummy('restart');
    lastSignature = '';
  }
}

function touchPoint(value) {
  if (!value) return null;
  let x = Number(value.clientX ?? value.pageX ?? value.x ?? value.screenX);
  let y = Number(value.clientY ?? value.pageY ?? value.y ?? value.screenY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x > width + 4 || y > height + 4) {
    const scale = Math.max(1, ratio);
    x /= scale;
    y /= scale;
  }
  return { x, y };
}

function pointerEvent(type, point) {
  return { type, clientX: point.x, clientY: point.y, pointerId: 1, pointerType: 'touch', preventDefault() {} };
}

wxApi.onTouchStart((event) => {
  const point = touchPoint(event.touches?.[0]);
  touchDebug = { phase: 'start', point, touches: event.touches?.length || 0, changedTouches: event.changedTouches?.length || 0 };
  if (!point) return;
  const screen = screenForState();
  const uiButton = Object.values(buttons).some((rect) => inside(point, rect));
  if (uiButton) {
    handleTap(point);
    touch = { start: point, last: point, canvas: false, handled: true };
    wxApi.vibrateShort?.({ type: 'light' });
    return;
  }
  touch = { start: point, last: point, canvas: screen === 'game' && !uiButton };
  if (touch.canvas) {
    nativeCanvas.dispatchEvent(pointerEvent('pointerdown', point));
    globalThis.__happyJumpPlatform.dispatchEvent(pointerEvent('pointerdown', point));
  }
});

wxApi.onTouchMove((event) => {
  const point = touchPoint(event.touches?.[0]);
  touchDebug = { phase: 'move', point, touches: event.touches?.length || 0, changedTouches: event.changedTouches?.length || 0 };
  if (!touch || !point) return;
  touch.last = point;
  if (touch.canvas) nativeCanvas.dispatchEvent(pointerEvent('pointermove', point));
});

wxApi.onTouchEnd((event) => {
  if (!touch) return;
  const point = touchPoint(event.changedTouches?.[0]) || touch.last;
  touchDebug = { phase: 'end', point, touches: event.touches?.length || 0, changedTouches: event.changedTouches?.length || 0 };
  const active = touch;
  touch = null;
  if (active.handled) return;
  if (active.canvas) nativeCanvas.dispatchEvent(pointerEvent('pointerup', point));
  else if (Math.hypot(point.x - active.start.x, point.y - active.start.y) < 16) handleTap(point);
});

wxApi.onTouchCancel(() => {
  if (touch?.canvas) nativeCanvas.dispatchEvent(pointerEvent('pointercancel', touch.last));
  touch = null;
});

wxApi.onHide(() => {
  document.hidden = true;
  globalThis.__happyJumpPlatform.dispatchEvent({ type: 'visibilitychange' });
});
wxApi.onShow(() => {
  document.hidden = false;
  globalThis.__happyJumpPlatform.dispatchEvent({ type: 'visibilitychange' });
});

function renderWechatOverlay({ renderer, state, levels }) {
  latestState = state;
  latestLevels = levels;
  ensureOverlay();
  if (state.over && !previousOver) saveResult(state);
  previousOver = state.over;

  const toast = document.querySelector('#toast');
  const tutorial = document.querySelector('#tutorial');
  const signature = JSON.stringify([
    screenForState(state), state.level, state.score, state.rounds, state.lives, Math.ceil(state.time),
    state.sound, state.levelResultOpen, state.over, state.nextQueue.slice(0, 4), toast.textContent,
    toast.classList.contains('show'), leaderboardState.status, leaderboardState.player.bestScore,
    leaderboardState.rank, leaderboardState.entries.length,
    tutorial.classList.contains('show'), document.querySelector('#tutorialKicker').textContent,
    document.querySelector('#tutorialTitle').textContent
  ]);
  const now = Date.now();
  if (signature !== lastSignature || now - lastDraw > 500) {
    draw(board.getState(), levels);
    writeDevtoolsState(state);
    lastSignature = signature;
    lastDraw = now;
  }

  const autoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(overlay.scene, overlay.camera);
  renderer.autoClear = autoClear;
}

let overlayErrorLogged = false;
globalThis.__happyJumpAfterRender = (runtime) => {
  try {
    renderWechatOverlay(runtime);
  } catch (error) {
    if (!overlayErrorLogged) {
      overlayErrorLogged = true;
      const detail = String(error?.stack || error?.message || error);
      try {
        wxApi.getFileSystemManager().writeFileSync(`${wxApi.env.USER_DATA_PATH}/happy-jump-overlay-error.txt`, detail, 'utf8');
      } catch { /* Keep the renderer alive even if diagnostics are unavailable. */ }
      console.error('Happy Jump overlay failed', error);
    }
  }
};

cloud.initialize()
  .then((result) => {
    updateCloudResult(result);
    leaderboardState.status = '微信账号已登录，历史成绩已恢复';
  })
  .catch(() => {
    leaderboardState.status = '当前使用本机记录';
  });

export { cloud, leaderboardState };
