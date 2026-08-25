const config = require('./config');
const {
  BOARD_SIZE,
  COLOR_COUNT,
  LEVELS,
  applyLanding,
  createBoard,
  movePosition,
  tileIndex
} = require('./rules');
const { WechatLeaderboard } = require('./cloud-leaderboard');

const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const width = windowInfo.windowWidth;
const height = windowInfo.windowHeight;
const pixelRatio = Math.min(windowInfo.pixelRatio || 1, 2);
canvas.width = Math.floor(width * pixelRatio);
canvas.height = Math.floor(height * pixelRatio);
ctx.scale(pixelRatio, pixelRatio);

const COLORS = ['#f69d46', '#f6d14e', '#7acd5a', '#42b4df', '#c982d7', '#f06b70'];
const COLOR_SHADOWS = ['#cf6f31', '#c4a139', '#4e9f3e', '#2785b3', '#9d58ac', '#bd4652'];
const STORAGE_BEST = 'happy-jump-wechat-local-best-v1';
const MIN_SWIPE = 22;

const leaderboard = new WechatLeaderboard(wx, config);
const imageCache = new Map();
const buttons = {};
let userInfoButton = null;
let touchStart = null;
let lastFrame = Date.now();
let animationHandle = null;

const app = {
  screen: 'home',
  previousScreen: 'home',
  cloudStatus: '正在连接微信账号...',
  toast: '',
  toastUntil: 0,
  player: {
    displayName: '微信玩家',
    avatarUrl: '',
    bestScore: Number(wx.getStorageSync(STORAGE_BEST)) || 0,
    bestLevel: 1,
    gamesPlayed: 0
  },
  entries: [],
  myRank: null,
  board: createBoard(),
  position: { row: 3, col: 3 },
  level: 0,
  rounds: 0,
  score: 0,
  time: LEVELS[0].time,
  cleared: [],
  clearedUntil: 0,
  won: false,
  resultMessage: ''
};

function loadImage(source) {
  if (!source) return null;
  if (imageCache.has(source)) return imageCache.get(source);
  const image = wx.createImage();
  image.loaded = false;
  image.onload = () => { image.loaded = true; };
  image.onerror = () => { image.loaded = false; };
  image.src = source;
  imageCache.set(source, image);
  return image;
}

const logo = loadImage('assets/happy-jump-logo.png');

function roundRect(context, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function fillRoundRect(x, y, w, h, radius, color) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
}

function drawText(text, x, y, size, color = '#173b52', align = 'left', weight = '400') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), x, y);
  ctx.restore();
}

function rememberButton(name, x, y, w, h) {
  buttons[name] = { x, y, w, h };
}

function inside(point, rect) {
  return point && rect && point.x >= rect.x && point.x <= rect.x + rect.w
    && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function showToast(message, duration = 1800) {
  app.toast = message;
  app.toastUntil = Date.now() + duration;
}

function drawBackground() {
  ctx.fillStyle = '#eaf9f4';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#76d8dd';
  ctx.fillRect(0, 0, width, Math.max(190, height * 0.36));
  ctx.fillStyle = '#49b6a1';
  ctx.fillRect(0, height - 74, width, 74);

  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  for (const cloud of [[44, 112, 58], [width - 62, 152, 44], [width * 0.56, 72, 34]]) {
    ctx.beginPath();
    ctx.arc(cloud[0], cloud[1], cloud[2] * 0.32, 0, Math.PI * 2);
    ctx.arc(cloud[0] + cloud[2] * 0.28, cloud[1] - 7, cloud[2] * 0.26, 0, Math.PI * 2);
    ctx.arc(cloud[0] + cloud[2] * 0.52, cloud[1], cloud[2] * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAvatar(x, y, size) {
  const avatar = loadImage(app.player.avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (avatar?.loaded) {
    ctx.drawImage(avatar, x - size / 2, y - size / 2, size, size);
  } else {
    ctx.fillStyle = '#ff665c';
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - size * 0.14, y - size * 0.05, size * 0.045, 0, Math.PI * 2);
    ctx.arc(x + size * 0.14, y - size * 0.05, size * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHome() {
  drawBackground();
  const contentTop = Math.max(36, height * 0.055);
  if (logo?.loaded) {
    const logoWidth = Math.min(width * 0.7, 286);
    const logoHeight = logoWidth * (logo.height / logo.width);
    ctx.drawImage(logo, (width - logoWidth) / 2, contentTop, logoWidth, logoHeight);
  } else {
    drawText('HAPPY JUMP', width / 2, contentTop + 38, 34, '#ffffff', 'center', '700');
  }

  const panelY = Math.max(185, height * 0.29);
  const panelX = 24;
  const panelW = width - 48;
  const panelH = Math.min(355, height - panelY - 92);
  fillRoundRect(panelX, panelY, panelW, panelH, 8, '#fffdf7');

  drawAvatar(panelX + 42, panelY + 38, 46);
  drawText(app.player.displayName, panelX + 76, panelY + 31, 17, '#173b52', 'left', '700');
  drawText(app.cloudStatus, panelX + 76, panelY + 52, 11, '#4a746e');

  const statsY = panelY + 124;
  ctx.strokeStyle = '#d9eee7';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(panelX + 18, statsY - 18);
  ctx.lineTo(panelX + panelW - 18, statsY - 18);
  ctx.stroke();
  drawText('历史最佳', panelX + 26, statsY, 13, '#5d7774');
  drawText(app.player.bestScore || 0, panelX + 26, statsY + 28, 24, '#173b52', 'left', '700');
  drawText('我的排名', panelX + panelW / 2 + 6, statsY, 13, '#5d7774');
  drawText(app.myRank ? `第 ${app.myRank} 名` : '暂无', panelX + panelW / 2 + 6, statsY + 28, 20, '#173b52', 'left', '700');

  const startY = panelY + panelH - 116;
  fillRoundRect(panelX + 22, startY, panelW - 44, 54, 8, '#f06b70');
  drawText('开始游戏', width / 2, startY + 27, 19, '#ffffff', 'center', '700');
  rememberButton('start', panelX + 22, startY, panelW - 44, 54);

  const rankY = startY + 66;
  fillRoundRect(panelX + 22, rankY, panelW - 44, 42, 8, '#dff2eb');
  drawText('查看全球排行榜', width / 2, rankY + 21, 15, '#226759', 'center', '700');
  rememberButton('leaderboard', panelX + 22, rankY, panelW - 44, 42);

  drawText('滑动屏幕，让角色跳到相邻方格', width / 2, height - 38, 13, '#ffffff', 'center', '700');
  syncUserInfoButton(panelX + 22, panelY + 68, panelW - 44, 34);
}

function boardMetrics() {
  const gap = Math.max(3, Math.min(6, width * 0.012));
  const boardWidth = Math.min(width - 28, 430);
  const cell = (boardWidth - gap * (BOARD_SIZE - 1)) / BOARD_SIZE;
  return {
    x: (width - boardWidth) / 2,
    y: Math.max(142, height * 0.22),
    width: boardWidth,
    cell,
    gap
  };
}

function drawMascot(x, y, size, now) {
  const bob = Math.sin(now / 115) * 2;
  ctx.save();
  ctx.translate(x, y + bob);
  fillRoundRect(-size * 0.42, -size * 0.55, size * 0.84, size * 0.76, size * 0.2, '#ff665c');
  ctx.fillStyle = '#3daf72';
  ctx.beginPath();
  ctx.ellipse(-size * 0.08, -size * 0.62, size * 0.12, size * 0.24, -0.72, 0, Math.PI * 2);
  ctx.ellipse(size * 0.12, -size * 0.62, size * 0.12, size * 0.23, 0.66, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#173b52';
  ctx.beginPath();
  ctx.arc(-size * 0.14, -size * 0.24, size * 0.035, 0, Math.PI * 2);
  ctx.arc(size * 0.14, -size * 0.24, size * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGame(now) {
  ctx.fillStyle = '#5adbe4';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#4aa884';
  ctx.fillRect(0, height * 0.64, width, height * 0.36);

  const hudY = 18;
  const hudH = 90;
  fillRoundRect(14, hudY, width - 28, hudH, 8, '#fffdf7');
  const columns = [width * 0.12, width * 0.36, width * 0.63, width * 0.86];
  drawText('关卡', columns[0], hudY + 22, 11, '#67807c', 'center');
  drawText(`${app.level + 1}/8`, columns[0], hudY + 51, 18, '#173b52', 'center', '700');
  drawText('分数', columns[1], hudY + 22, 11, '#67807c', 'center');
  drawText(app.score, columns[1], hudY + 51, 18, '#173b52', 'center', '700');
  drawText('爆破回合', columns[2], hudY + 22, 11, '#67807c', 'center');
  drawText(`${app.rounds}/${LEVELS[app.level].goal}`, columns[2], hudY + 51, 18, '#173b52', 'center', '700');
  drawText('时间', columns[3], hudY + 22, 11, '#67807c', 'center');
  drawText(Math.ceil(app.time), columns[3], hudY + 51, 18, app.time <= 10 ? '#c63e4c' : '#173b52', 'center', '700');
  drawText(LEVELS[app.level].name, width / 2, hudY + 76, 12, '#2c7465', 'center', '700');

  const metrics = boardMetrics();
  const boardHeight = metrics.cell * BOARD_SIZE + metrics.gap * (BOARD_SIZE - 1);
  fillRoundRect(metrics.x - 8, metrics.y + 8, metrics.width + 16, boardHeight + 18, 8, '#d7ad59');

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const index = tileIndex(row, col);
      const x = metrics.x + col * (metrics.cell + metrics.gap);
      const y = metrics.y + row * (metrics.cell + metrics.gap);
      const color = app.board[index];
      const flashing = app.cleared.includes(index) && now < app.clearedUntil;
      fillRoundRect(x, y + 5, metrics.cell, metrics.cell, 7, COLOR_SHADOWS[color]);
      fillRoundRect(x, y, metrics.cell, metrics.cell - 3, 7, flashing ? '#ffffff' : COLORS[color]);
      ctx.fillStyle = 'rgba(255,255,255,0.26)';
      fillRoundRect(x + 6, y + 5, Math.max(7, metrics.cell * 0.25), 4, 2, 'rgba(255,255,255,0.3)');
    }
  }

  const playerX = metrics.x + app.position.col * (metrics.cell + metrics.gap) + metrics.cell / 2;
  const playerY = metrics.y + app.position.row * (metrics.cell + metrics.gap) + metrics.cell / 2;
  drawMascot(playerX, playerY, Math.max(29, metrics.cell * 0.82), now);

  const hintY = Math.min(height - 72, metrics.y + boardHeight + 44);
  fillRoundRect(width / 2 - 112, hintY - 20, 224, 40, 8, 'rgba(255,253,247,0.9)');
  drawText('上下左右滑动 · 四格同色爆破', width / 2, hintY, 13, '#285f56', 'center', '700');
}

function drawLeaderboard() {
  drawBackground();
  drawText('全球排行榜', width / 2, 50, 26, '#ffffff', 'center', '700');
  const x = 18;
  const y = 84;
  const w = width - 36;
  const h = height - 112;
  fillRoundRect(x, y, w, h, 8, '#fffdf7');

  const entries = app.entries.slice(0, Math.max(5, Math.floor((h - 92) / 48)));
  if (!entries.length) {
    drawText('还没有云端成绩', width / 2, y + 120, 17, '#5d7774', 'center', '700');
    drawText('完成一局后成为首位上榜玩家', width / 2, y + 150, 13, '#78908c', 'center');
  }
  entries.forEach((entry, index) => {
    const rowY = y + 62 + index * 48;
    if (index % 2 === 0) fillRoundRect(x + 12, rowY - 20, w - 24, 42, 6, '#edf7f3');
    drawText(index + 1, x + 34, rowY, 15, index < 3 ? '#d88630' : '#62807a', 'center', '700');
    drawText(entry.displayName || '微信玩家', x + 58, rowY, 14, '#173b52', 'left', '700');
    drawText(entry.bestScore || 0, x + w - 24, rowY, 16, '#236f60', 'right', '700');
  });

  fillRoundRect(x + 20, y + h - 58, w - 40, 40, 8, '#dff2eb');
  drawText('返回', width / 2, y + h - 38, 15, '#226759', 'center', '700');
  rememberButton('back', x + 20, y + h - 58, w - 40, 40);
  hideUserInfoButton();
}

function drawResult() {
  drawBackground();
  const x = 24;
  const y = Math.max(100, height * 0.16);
  const w = width - 48;
  const h = Math.min(430, height - y - 78);
  fillRoundRect(x, y, w, h, 8, '#fffdf7');
  drawText(app.won ? '八层通关' : '本局结束', width / 2, y + 50, 27, '#173b52', 'center', '700');
  drawText(app.resultMessage, width / 2, y + 82, 14, '#59746f', 'center');
  drawText(app.score, width / 2, y + 135, 42, '#f06b70', 'center', '700');
  drawText('本局得分', width / 2, y + 173, 13, '#78908c', 'center');

  drawText(`历史最佳  ${app.player.bestScore || app.score}`, width / 2, y + 215, 16, '#236f60', 'center', '700');
  drawText(app.myRank ? `全球第 ${app.myRank} 名` : '成绩正在同步', width / 2, y + 244, 14, '#59746f', 'center');

  fillRoundRect(x + 22, y + h - 116, w - 44, 50, 8, '#f06b70');
  drawText('再玩一次', width / 2, y + h - 91, 18, '#ffffff', 'center', '700');
  rememberButton('restart', x + 22, y + h - 116, w - 44, 50);
  fillRoundRect(x + 22, y + h - 56, w - 44, 40, 8, '#dff2eb');
  drawText('查看排行榜', width / 2, y + h - 36, 15, '#226759', 'center', '700');
  rememberButton('resultLeaderboard', x + 22, y + h - 56, w - 44, 40);
  hideUserInfoButton();
}

function drawToast() {
  if (!app.toast || Date.now() >= app.toastUntil) return;
  const y = height - 102;
  fillRoundRect(width / 2 - 130, y - 20, 260, 40, 8, 'rgba(23,59,82,0.9)');
  drawText(app.toast, width / 2, y, 13, '#ffffff', 'center', '700');
}

function draw(now) {
  Object.keys(buttons).forEach((key) => { delete buttons[key]; });
  if (app.screen === 'game') drawGame(now);
  else if (app.screen === 'leaderboard') drawLeaderboard();
  else if (app.screen === 'result') drawResult();
  else drawHome();
  drawToast();
}

function directionFromDelta(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_SWIPE) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

function move(direction) {
  if (app.screen !== 'game') return false;
  const next = movePosition(app.position, direction);
  if (next.row === app.position.row && next.col === app.position.col) return false;
  app.position = next;
  const landing = applyLanding(app.board, next);
  app.board = landing.board;
  app.score += landing.points;
  app.rounds += landing.rounds;
  if (landing.cleared.length) {
    app.cleared = landing.cleared;
    app.clearedUntil = Date.now() + 280;
    showToast(`${landing.cleared.length} 格爆破 +${landing.points}`);
  }
  if (app.rounds >= LEVELS[app.level].goal) completeLevel();
  return true;
}

function startGame() {
  hideUserInfoButton();
  app.screen = 'game';
  app.board = createBoard();
  app.position = { row: 3, col: 3 };
  app.level = 0;
  app.rounds = 0;
  app.score = 0;
  app.time = LEVELS[0].time;
  app.cleared = [];
  app.won = false;
  lastFrame = Date.now();
  showToast('第一层 · 初芽庭院');
}

function completeLevel() {
  if (app.level >= LEVELS.length - 1) {
    finishGame(true, '所有方格挑战完成');
    return;
  }
  app.level += 1;
  app.rounds = 0;
  app.time = LEVELS[app.level].time;
  app.board = createBoard();
  app.position = { row: 3, col: 3 };
  showToast(`第 ${app.level + 1} 层 · ${LEVELS[app.level].name}`);
}

function finishGame(won, message) {
  app.screen = 'result';
  app.won = won;
  app.resultMessage = message;
  if (app.score > app.player.bestScore) {
    app.player.bestScore = app.score;
    wx.setStorageSync(STORAGE_BEST, app.score);
  }
  leaderboard.submitScore({ score: app.score, level: app.level + 1, won })
    .then((result) => {
      applyCloudResult(result);
      showToast('成绩已保存到微信云端');
    })
    .catch(() => showToast('网络恢复后会自动补传成绩', 2400));
}

function openLeaderboard(fromScreen) {
  app.previousScreen = fromScreen || app.screen;
  app.screen = 'leaderboard';
  hideUserInfoButton();
  if (leaderboard.ready) {
    leaderboard.refresh()
      .then(applyCloudResult)
      .catch(() => showToast('排行榜刷新失败，请稍后重试'));
  }
}

function applyCloudResult(result) {
  if (result?.player) app.player = { ...app.player, ...result.player };
  if (Array.isArray(result?.entries)) app.entries = result.entries;
  if (Number.isInteger(result?.myRank)) app.myRank = result.myRank;
  else if (result && Object.prototype.hasOwnProperty.call(result, 'myRank')) app.myRank = null;
}

function syncUserInfoButton(x, y, w, h) {
  if (!leaderboard.ready || app.screen !== 'home') {
    hideUserInfoButton();
    return;
  }
  if (!userInfoButton) {
    userInfoButton = wx.createUserInfoButton({
      type: 'text',
      text: app.player.avatarUrl ? '重新选择微信头像昵称' : '使用微信头像昵称',
      withCredentials: true,
      lang: 'zh_CN',
      style: {
        left: x,
        top: y,
        width: w,
        height: h,
        lineHeight: h,
        backgroundColor: '#e4f4ee',
        borderColor: '#e4f4ee',
        borderWidth: 0,
        borderRadius: 8,
        color: '#226759',
        textAlign: 'center',
        fontSize: 13
      }
    });
    userInfoButton.onTap((result) => {
      if (!result?.userInfo || !result.cloudID) {
        showToast('未授权昵称头像，仍可匿名保存成绩', 2200);
        return;
      }
      leaderboard.updateAuthorizedProfile(result.cloudID)
        .then((cloudResult) => {
          applyCloudResult(cloudResult);
          userInfoButton.destroy();
          userInfoButton = null;
          showToast('微信头像昵称已更新');
        })
        .catch(() => showToast('头像昵称更新失败，请稍后重试'));
    });
  } else {
    userInfoButton.show();
  }
}

function hideUserInfoButton() {
  userInfoButton?.hide();
}

function handleTap(point) {
  if (app.screen === 'home') {
    if (inside(point, buttons.start)) startGame();
    else if (inside(point, buttons.leaderboard)) openLeaderboard('home');
  } else if (app.screen === 'result') {
    if (inside(point, buttons.restart)) startGame();
    else if (inside(point, buttons.resultLeaderboard)) openLeaderboard('result');
  } else if (app.screen === 'leaderboard' && inside(point, buttons.back)) {
    app.screen = app.previousScreen === 'result' ? 'result' : 'home';
  }
}

wx.onTouchStart((event) => {
  const touch = event.touches && event.touches[0];
  if (!touch) return;
  touchStart = { x: touch.clientX, y: touch.clientY };
});

wx.onTouchMove((event) => {
  if (app.screen !== 'game' || !touchStart) return;
  const touch = event.touches && event.touches[0];
  if (!touch) return;
  const direction = directionFromDelta(touch.clientX - touchStart.x, touch.clientY - touchStart.y);
  if (direction && move(direction)) {
    touchStart = { x: touch.clientX, y: touch.clientY };
  }
});

wx.onTouchEnd((event) => {
  if (!touchStart) return;
  const touch = event.changedTouches && event.changedTouches[0];
  const end = touch ? { x: touch.clientX, y: touch.clientY } : touchStart;
  if (app.screen === 'game') {
    const direction = directionFromDelta(end.x - touchStart.x, end.y - touchStart.y);
    if (direction) move(direction);
  } else {
    handleTap(end);
  }
  touchStart = null;
});

wx.onTouchCancel(() => { touchStart = null; });
wx.onHide(() => { lastFrame = Date.now(); });
wx.onShow(() => { lastFrame = Date.now(); });

function frame() {
  const now = Date.now();
  const delta = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (app.screen === 'game') {
    app.time = Math.max(0, app.time - delta);
    if (app.time <= 0) finishGame(false, '时间到，再试一次');
  }
  draw(now);
  animationHandle = requestAnimationFrame(frame);
}

leaderboard.initialize()
  .then((result) => {
    applyCloudResult(result);
    app.cloudStatus = '微信账号已登录 · 云端记录已恢复';
  })
  .catch(() => {
    app.cloudStatus = '云环境待配置 · 当前使用本机记录';
  });

frame();

module.exports = { app, canvas, leaderboard };
