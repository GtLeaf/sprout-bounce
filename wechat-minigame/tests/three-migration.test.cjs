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
  assert.match(shim, /const pixelRatio = Math\.max\(1, Number\(info\.pixelRatio \|\| 1\)\)/);
  assert.match(shim, /const ratio = Math\.min\(pixelRatio, 1\.5\)/);
  assert.match(shim, /__happyJumpPlatform\.loadImage/);
  assert.match(shim, /forwardedPointerEvents/);
  assert.match(shim, /nativeCanvas\.addEventListener =/);
  assert.match(shim, /dispatch\(canvasListeners, event\)/);
  assert.doesNotMatch(shim, /nativeCanvas\.addEventListener \|\|=/);
  assert.match(ui, /new WechatLeaderboard\(wxApi, config\)/);
  assert.match(ui, /wxApi\.onTouchStart/);
  assert.match(ui, /wxApi\.onHide/);
  assert.match(ui, /function applyVisibility\(hidden\)/);
  assert.match(ui, /if \(hidden\) \{\s*onTouchCancel\(\);\s*recentTouch = null;\s*touchReceipt = null;\s*hideProfileButton\(\)/);
  assert.match(ui, /wxApi\.onHide\(\(\) => applyVisibility\(true\)\)/);
  assert.match(ui, /wxApi\.onShow\(\(\) => applyVisibility\(false\)\)/);
  assert.match(ui, /__happyJumpAfterRender/);
  assert.doesNotMatch(ui, /setTimeout\(\(\) => clickDummy\('start'\)/);
});

test('the shared 3D game exposes its renderer hook and native scene background', async () => {
  const game = await source('game.js');
  assert.match(game, /canvas: platform\.canvas/);
  assert.match(game, /scene\.background = new THREE\.Color\(0x5adbe4\)/);
  assert.match(game, /platform\.loadImage\?\.\('assets\/sprout-arena-portrait\.jpg'\)/);
  assert.match(game, /texture\.colorSpace = THREE\.NoColorSpace/);
  assert.match(game, /__happyJumpAfterRender/);
  assert.match(game, /if \(platform\.canvas\) return true;/);
  assert.match(game, /platform\.canvas \? THREE\.NoToneMapping/);
  assert.match(game, /new THREE\.MeshBasicMaterial/);
  assert.match(game, /material\.userData\.gameGlowColor = new THREE\.Color/);
  assert.doesNotMatch(game, /material\.emissive = new THREE\.Color/);
  assert.match(game, /setMaterialGlowIntensity/);
  assert.match(game, /renderer\.shadowMap\.enabled = !platform\.canvas/);
  assert.match(game, /BURST_PARTICLES_PER_TILE = platform\.canvas \? 4 : 10/);
  assert.match(game, /if \(!AudioContextClass\)/);
  assert.match(game, /if \(!context \|\| !state\.musicBus\) return false/);
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

test('the result screen can focus and activate its registered restart control', async () => {
  const game = await source('game.js');
  assert.match(game, /result: \$\('#result'\), restart: \$\('#restart'\)/);
  assert.match(game, /ui\.restart\.focus\(\{ preventScroll: true \}\)/);
  assert.match(game, /\$\('#restart'\)\.addEventListener\('click', reset\)/);
});

test('physical-device input bypasses synthetic browser events for controls and swipes', async () => {
  const [game, ui] = await Promise.all([
    source('game.js'),
    source('wechat-minigame/src/wechat-ui.mjs')
  ]);
  assert.match(game, /start: reset/);
  assert.match(game, /move: \(rowDelta, colDelta/);
  assert.match(game, /swipe: \(deltaX, deltaY/);
  assert.match(game, /tutorialNext: advanceTutorial/);
  assert.match(ui, /touchPoints\(value/);
  assert.match(ui, /touchValue\(event/);
  assert.match(ui, /devicePixelRatio: pixelRatio/);
  assert.match(ui, /handleTap\(point, true\)/);
  assert.match(ui, /board\.start\(\)/);
  assert.match(ui, /board\.swipe\(point\.x - touch\.start\.x/);
  assert.match(ui, /active\.handled/);
  assert.match(ui, /nativeCanvas\.addEventListener\?\.\('touchstart', onTouchStart\)/);
  assert.match(ui, /nativeCanvas\.ontouchstart = onTouchStart/);
  assert.match(ui, /触摸已接收/);
});

test('the home screen identifies the current physical-device preview build', async () => {
  const ui = await source('wechat-minigame/src/wechat-ui.mjs');
  assert.match(ui, /BUILD_LABEL = '体验版 0\.3\.7'/);
  assert.match(ui, /text\(BUILD_LABEL/);
});

test('the mini game packages and renders the original branded key art', async () => {
  const ui = await source('wechat-minigame/src/wechat-ui.mjs');
  const assets = await Promise.all([
    source('wechat-minigame/assets/sprout-keyart-mobile.jpg'),
    source('wechat-minigame/assets/happy-jump-logo.png')
  ]);
  assert.match(ui, /assets\/sprout-keyart-mobile\.jpg/);
  assert.match(ui, /assets\/happy-jump-logo\.png/);
  assert.match(ui, /texture\.colorSpace = THREE\.NoColorSpace/);
  assert.match(ui, /material\.toneMapped = false/);
  assert.ok(assets.every((asset) => asset.length > 50_000));
});

test('the mini game packages the AIGC portrait arena, paper surface and compact web audio mix', async () => {
  const assets = await Promise.all([
    readFile(path.join(root, 'wechat-minigame/assets/sprout-arena-portrait.jpg')),
    readFile(path.join(root, 'wechat-minigame/assets/sprout-ui-paper.jpg')),
    readFile(path.join(root, 'wechat-minigame/assets/audio/mix-v91/happyjump-bgm-bouncy-party-v91.wav')),
    readFile(path.join(root, 'wechat-minigame/assets/audio/mix-v92/happyjump-hop-soft-pop-v92.wav'))
  ]);
  assert.ok(assets[0].length > 60_000 && assets[0].length < 200_000);
  assert.ok(assets[1].length > 1_000 && assets[1].length < 20_000);
  assert.equal(assets[2].subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(assets[3].subarray(0, 4).toString('ascii'), 'RIFF');
});

test('first-time WeChat players receive the complete live-board tutorial', async () => {
  const [game, ui] = await Promise.all([
    source('game.js'),
    source('wechat-minigame/src/wechat-ui.mjs')
  ]);
  assert.match(game, /if \(platform\.canvas\) return true;/);
  assert.match(ui, /return 'tutorial'/);
  assert.match(ui, /function drawTutorialVisual/);
  assert.match(ui, /board\.tutorialPrevious\(\)/);
  assert.match(ui, /board\.tutorialNext\(\)/);
  assert.match(ui, /board\.tutorialClose\(\)/);
});

test('developer-tool diagnostics expose runtime state without running on phones', async () => {
  const [entry, game, ui] = await Promise.all([
    source('wechat-minigame/game.js'),
    source('game.js'),
    source('wechat-minigame/src/wechat-ui.mjs')
  ]);
  assert.match(entry, /removeStorageSync\?\.\('happy-jump-startup-error'\)/);
  assert.match(game, /getDebugState/);
  assert.match(game, /colors: tiles\.map/);
  assert.match(ui, /isDevtools/);
  assert.match(ui, /happy-jump-devtools-state-v1/);
  assert.match(ui, /happy-jump-devtools-touch-v1/);
  assert.match(ui, /happy-jump-devtools-lifecycle-v1/);
  assert.match(ui, /runDevtoolsTouchTest\(\)/);
  assert.match(ui, /runDevtoolsLifecycleTest\(\)/);
  assert.match(ui, /if \(!isDevtools\) return/);
  assert.match(ui, /lifecycleDebug/);
  assert.match(ui, /touchActive: Boolean\(touch\)/);
});

test('a test AppID saves results locally without calling an unavailable cloud API', async () => {
  const ui = await source('wechat-minigame/src/wechat-ui.mjs');
  assert.match(ui, /function saveResult\(state\)[\s\S]*?if \(!cloud\.ready\) \{[\s\S]*?成绩已保存在本机[\s\S]*?return;/);
  assert.match(ui, /if \(!cloud\.ready\) return;[\s\S]*?cloud\.refresh\(\)/);
});
