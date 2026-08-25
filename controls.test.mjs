import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';


const [html, script, styles] = await Promise.all([
  readFile(new URL('./index.html', import.meta.url), 'utf8'),
  readFile(new URL('./game.js', import.meta.url), 'utf8'),
  readFile(new URL('./style.css', import.meta.url), 'utf8')
]);


test('the game uses the Happy Jump brand and generated logo', () => {
  assert.match(html, /<title>Happy Jump<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="Happy Jump"/);
  assert.match(html, /assets\/happy-jump-logo-v80\.png" alt="Happy Jump"/);
  assert.doesNotMatch(html, /芽芽弹跳方阵|sprout-logo-v50/);
});

test('start button uses the optically centered forward icon', () => {
  assert.match(html, /id="start"[\s\S]*?assets\/ui-forward-v80\.png/);
  assert.match(styles, /\.primary \.control-icon \{[\s\S]*?width: 20px;[\s\S]*?height: 20px;/);
});


test('mobile controls use gestures without a permanent direction pad', () => {
  assert.match(html, /id="swipePad"/);
  assert.doesNotMatch(html, /movePad|move-key|data-direction=/);
  assert.doesNotMatch(styles, /\.move-pad|\.move-key/);
});

test('first mobile visit teaches on the live board after starting the game', () => {
  assert.match(html, /id="tutorial"[\s\S]*?id="tutorialVisual"[\s\S]*?data-tutorial-step="0"[\s\S]*?data-tutorial-step="1"[\s\S]*?data-tutorial-step="2"/);
  assert.match(html, /滑动跳跃[\s\S]*?向上下左右滑动/);
  assert.match(styles, /\.tutorial \{[\s\S]*?background: rgba\(29, 77, 78, 0\.14\)/);
  assert.match(styles, /\.tutorial-scene\[aria-hidden="false"\]/);
  assert.match(styles, /@keyframes tutorial-warning-flash/);
  assert.doesNotMatch(styles, /sprout-mobile-tutorial-v74\.png|background-size: 300% 100%/);
  assert.match(script, /const TUTORIAL_STORAGE_KEY = 'happy-jump-mobile-tutorial-v2'/);
  assert.match(script, /localStorage\.getItem\(TUTORIAL_STORAGE_KEY\) === 'done'/);
  assert.match(script, /localStorage\.setItem\(TUTORIAL_STORAGE_KEY, 'done'\)/);
  assert.match(script, /innerWidth <= 900[\s\S]*?matchMedia\('\(pointer: coarse\)'\)\.matches/);
  assert.match(script, /Math\.abs\(delta\) >= 36/);
  assert.match(script, /function showTutorial\(\)[\s\S]*?state\.locked = true/);
  assert.match(script, /function dismissTutorial\(\)[\s\S]*?state\.locked = tutorialLockBeforeShow/);
  assert.match(script, /function reset\(\)[\s\S]*?startLevel\(0\);[\s\S]*?TUTORIAL_QUERY === '1' \|\| !hasSeenTutorial\(\)[\s\S]*?showTutorial\(\)/);
  assert.doesNotMatch(script, /setTimeout\(showTutorial, 320\)/);
});


test('holding a swipe continues movement in the same direction', () => {
  assert.match(script, /pointerStart\?\.move && now >= pointerStart\.nextMoveAt/);
  assert.match(script, /const HELD_MOVE_INTERVAL = Math\.round\(RHYTHM_BEAT_SECONDS \* 1000\)/);
  assert.match(script, /pointerStart\.nextMoveAt = now \+ HELD_MOVE_INTERVAL/);
});

test('mobile play pauses while the page is backgrounded and resumes cleanly', () => {
  assert.match(script, /paused: false/);
  assert.match(script, /function pauseForBackground\(\)[\s\S]*?stopMixCues\(\);[\s\S]*?stopMusic\(\)/);
  assert.match(script, /function resumeFromBackground\(\)[\s\S]*?startMusic\(\)/);
  assert.match(script, /addEventListener\('visibilitychange', \(\) => \{[\s\S]*?document\.hidden[\s\S]*?pauseForBackground\(\)[\s\S]*?resumeFromBackground\(\)/);
  assert.match(script, /if \(!state\.running \|\| state\.paused \|\| state\.locked \|\| state\.falling\) return false/);
  assert.match(script, /if \(state\.paused\) return;/);
  assert.match(html, /id="toast"[^>]*role="status"[^>]*aria-live="polite"/);
});

test('intro and result overlays keep keyboard focus in the active flow', () => {
  assert.match(html, /id="intro"[^>]*aria-hidden="false"/);
  assert.match(html, /id="result"[^>]*aria-hidden="true"[^>]*inert/);
  assert.match(script, /ui\.intro\.setAttribute\('aria-hidden', 'true'\)[\s\S]*?ui\.intro\.inert = true/);
  assert.match(script, /ui\.result\.setAttribute\('aria-hidden', 'true'\)[\s\S]*?ui\.result\.inert = true/);
  assert.match(script, /ui\.result\.setAttribute\('aria-hidden', 'false'\)[\s\S]*?ui\.result\.inert = false[\s\S]*?ui\.restart\.focus/);
});

test('each cleared level pauses on a settlement card and the final screen has a persistent leaderboard', () => {
  assert.match(html, /id="levelResult"[^>]*aria-hidden="true"[^>]*inert/);
  assert.match(html, /id="levelResultScore"/);
  assert.match(html, /id="levelResultTiles"/);
  assert.match(html, /id="levelResultRounds"/);
  assert.match(html, /id="levelContinue"/);
  assert.match(html, /class="leaderboard-block"[\s\S]*?id="leaderboard"/);
  assert.match(script, /const LEADERBOARD_STORAGE_KEY = 'happy-jump-leaderboard-v1'/);
  assert.match(script, /function showLevelResult\(\)[\s\S]*?state\.levelResultOpen = true[\s\S]*?ui\.levelContinue\.focus/);
  assert.match(script, /function continueFromLevelResult\(\)[\s\S]*?startLevel\(state\.level \+ 1\)/);
  assert.match(script, /state\.transitionTimer = 0\.28/);
  assert.match(script, /const playerInDanger = currentState === 'warn' \|\| currentState === 'bursting'/);
  assert.doesNotMatch(script, /const boardBusy = tiles\.some\(\(tile\) => tile\.userData\.state !== 'solid'\)/);
  assert.match(script, /if \(state\.level === LEVELS\.length - 1\) finish\(true\)/);
  assert.match(html, /id="introAccount"[\s\S]*?id="accountDialog"[\s\S]*?id="accountForm"/);
  assert.match(html, /id="accountEmail"[\s\S]*?id="accountPassword"[\s\S]*?id="accountSignOut"/);
  assert.match(script, /const PENDING_SCORES_STORAGE_KEY = 'happy-jump-pending-scores-v1'/);
  assert.match(script, /function recordLocalLeaderboard\(entry\)[\s\S]*?saveLeaderboard\(top\)/);
  assert.match(script, /function recordLeaderboard\(win\)[\s\S]*?queuePendingScore\(entry\)/);
  assert.match(script, /async function flushPendingScores\(\)[\s\S]*?cloudLeaderboard\.submitScore/);
  assert.match(script, /cloudLeaderboard\.restoreSession\(\)/);
  assert.match(script, /recordLeaderboard\(win\)/);
  assert.match(styles, /\.level-summary \{[\s\S]*?grid-template-columns: repeat\(3, 1fr\)/);
  assert.match(styles, /#leaderboard \{[\s\S]*?list-style: none/);
  assert.match(styles, /\.account-modes \{[\s\S]*?grid-template-columns: 1fr 1fr/);
});


test('single hops use the faster movement timing', () => {
  assert.match(script, /const RHYTHM_BPM = 128/);
  assert.match(script, /const RHYTHM_BEAT_SECONDS = 60 \/ RHYTHM_BPM \/ 2/);
  assert.match(script, /const HOP_DURATION = RHYTHM_BEAT_SECONDS/);
  assert.match(script, /duration: HOP_DURATION/);
});

test('hops preserve a squash, stretch, landing, and rebound cycle', () => {
  assert.match(script, /const HOP_ANTICIPATION = 0\.11/);
  assert.match(script, /const HOP_FLIGHT_END = 0\.88/);
  assert.match(script, /const HOP_HEIGHT = 1\.5/);
  assert.match(script, /fromScale: player\.scale\.clone\(\)/);
  assert.match(script, /player\.scale\.set\(widthScale, heightScale, widthScale\)/);
  assert.match(script, /state\.landingStrength = 1\.05/);
  assert.match(script, /Math\.cos\(state\.landingAge \* 25\) \* state\.landingStrength/);
});


test('board uses a compact yellow platform with green supports beneath individual tiles', () => {
  assert.match(script, /const boardSpan = BOARD \* STEP - GAP/);
  assert.match(script, /const platformRadius = \(boardSpan \+ 0\.34\) \/ Math\.SQRT2/);
  assert.match(script, /new THREE\.CylinderGeometry\(platformRadius, platformRadius - 0\.16, 0\.28, 4, 1, false\)/);
  assert.match(script, /lowPolyMaterial\(0xe0b75f\)/);
  assert.match(script, /const baseGroup = new THREE\.Group\(\)/);
  assert.match(script, /const baseGeometry = new RoundedBoxGeometry\(SIZE - 0\.08, 0\.14, SIZE - 0\.08, 1, 0\.07\)/);
  assert.match(script, /lowPolyMaterial\(0x27695e\)[\s\S]*?lowPolyMaterial\(0x317765\)/);
  assert.doesNotMatch(script, /boardFrame/);
});

test('sound control matches the adjacent queue panel at mobile sizes', () => {
  assert.match(styles, /@media \(max-width: 600px\) \{[\s\S]*?\.next-panel \{ width: 76px; height: 42px;[\s\S]*?\.icon-button \{ width: 42px; height: 42px; \}/);
  assert.match(styles, /@media \(max-width: 380px\) \{[\s\S]*?\.next-panel \{ width: 66px;[\s\S]*?\.icon-button \{ width: 42px; height: 42px; \}/);
  assert.match(styles, /#soundIcon\[src\$="ui-sound-on\.png"\] \{ transform: translate\(-1\.25px, -4\.75px\); \}/);
  assert.match(styles, /#soundIcon\[src\$="ui-sound-off\.png"\] \{ transform: translate\(0\.25px, -4\.25px\); \}/);
});

test('camera uses a centered, rotated board view', () => {
  assert.match(script, /new THREE\.Vector3\(0\.4, 1\.55, 1\.09\)/);
  assert.match(script, /const MOBILE_CAMERA_DISTANCE = 15\.6/);
  assert.match(script, /const MOBILE_CAMERA_TARGET_X = -0\.38/);
  assert.match(script, /MOBILE_CAMERA_DISTANCE \/ Math\.min\(camera\.aspect, 1\)/);
  assert.match(script, /cameraTarget\.x = compact \? MOBILE_CAMERA_TARGET_X : 0/);
  assert.doesNotMatch(script, /new THREE\.Vector3\(0\.82, 1\.55, 0\.82\)/);
  assert.doesNotMatch(script, /camera\.aspect < 0\.65\s*\? 39/);
});
