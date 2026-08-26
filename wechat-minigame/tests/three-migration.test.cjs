const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

async function source(file) {
  return readFile(path.join(root, file), 'utf8');
}

test('the mini game boots the bundled Three.js migration instead of the legacy 2D entry', async () => {
  const [entry, migration] = await Promise.all([
    source('wechat-minigame/game.js'),
    source('wechat-minigame/src/main-3d.mjs')
  ]);
  assert.match(entry, /require\('\.\/src\/main-3d\.js'\)/);
  assert.match(migration, /import '\.\/mini-shim\.mjs'/);
  assert.match(migration, /import '\.\.\/\.\.\/game\.js'/);
});

test('the platform layer supplies WeChat canvas, storage, touch and lifecycle services', async () => {
  const [shim, ui] = await Promise.all([
    source('wechat-minigame/src/mini-shim.mjs'),
    source('wechat-minigame/src/wechat-ui.mjs')
  ]);
  assert.match(shim, /wxApi\?\.createCanvas\?\.\(\)/);
  assert.match(shim, /__happyJumpPlatform/);
  assert.match(shim, /getStorageSync/);
  assert.match(ui, /new WechatLeaderboard\(wxApi, config\)/);
  assert.match(ui, /wxApi\.onTouchStart/);
  assert.match(ui, /wxApi\.onHide/);
  assert.match(ui, /__happyJumpAfterRender/);
  assert.doesNotMatch(ui, /setTimeout\(\(\) => clickDummy\('start'\)/);
});

test('the shared 3D game exposes its renderer hook and native scene background', async () => {
  const game = await source('game.js');
  assert.match(game, /canvas: platform\.canvas/);
  assert.match(game, /if \(platform\.canvas\) scene\.background = new THREE\.Color\(0x5adbe4\)/);
  assert.match(game, /__happyJumpAfterRender/);
  assert.match(game, /if \(platform\.canvas\) return false;/);
});

test('the bundled renderer can fall back to WebGL 1 on physical WeChat devices', async () => {
  const [three, bundle] = await Promise.all([
    source('vendor/three/three.module.js'),
    source('wechat-minigame/src/main-3d.js')
  ]);
  assert.match(three, /const REVISION = '162'/);
  assert.match(three, /\[ 'webgl2', 'webgl', 'experimental-webgl' \]/);
  assert.doesNotMatch(bundle, /WebGL 1 is not supported since r163/);
  assert.match(bundle, /\[\"webgl2\", \"webgl\", \"experimental-webgl\"\]/);
});

test('startup failures are visible instead of leaving a black screen', async () => {
  const entry = await source('wechat-minigame/game.js');
  assert.match(entry, /wx\.showModal/);
  assert.match(entry, /游戏启动失败/);
});
