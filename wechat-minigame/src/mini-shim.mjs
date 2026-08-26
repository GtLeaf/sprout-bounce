/* Small browser surface for the shared Three.js game. The game world stays
 * shared with the web build; only the platform services are translated here. */
const wxApi = globalThis.wx;
const info = wxApi?.getWindowInfo?.() || wxApi?.getSystemInfoSync?.() || {
  windowWidth: 375, windowHeight: 667, pixelRatio: 2
};

const width = Number(info.windowWidth || info.screenWidth || 375);
const height = Number(info.windowHeight || info.screenHeight || 667);
// 1.5x keeps text crisp while avoiding a 2x full-screen WebGL framebuffer on
// older phones. The generated arena art is sized for this render budget.
const ratio = Math.min(Number(info.pixelRatio || 1), 1.5);
const nativeCanvas = wxApi?.createCanvas?.();
const globalListeners = new Map();
const canvasListeners = new Map();

function listen(store, type, listener) {
  if (!store.has(type)) store.set(type, []);
  store.get(type).push(listener);
}

function dispatch(store, event) {
  (store.get(event.type) || []).forEach((listener) => listener(event));
}

function makeClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    toggle: (name, force) => {
      const next = force === undefined ? !values.has(name) : Boolean(force);
      if (next) values.add(name); else values.delete(name);
      return next;
    },
    contains: (name) => values.has(name)
  };
}

function makeElement(id = '', tagName = 'div') {
  const listeners = new Map();
  const element = {
    id,
    tagName: tagName.toUpperCase(),
    style: {},
    dataset: {},
    classList: makeClassList(),
    children: [],
    hidden: false,
    inert: false,
    disabled: false,
    value: '',
    textContent: '',
    innerHTML: '',
    parentNode: null,
    appendChild(child) {
      this.children.push(child);
      try { child.parentNode = this; } catch { /* Native WeChat nodes expose a read-only parent. */ }
      return child;
    },
    append(...children) { children.forEach((child) => this.appendChild(child)); },
    replaceChildren(...children) {
      this.children = children;
      children.forEach((child) => {
        try { child.parentNode = this; } catch { /* Native WeChat nodes expose a read-only parent. */ }
      });
    },
    removeChild(child) { this.children = this.children.filter((item) => item !== child); },
    querySelector(selector) {
      if (selector === 'span') return this.children.find((child) => child.tagName === 'SPAN') || makeElement('', 'span');
      if (selector === 'i') return this.children.find((child) => child.tagName === 'I') || makeElement('', 'i');
      return makeElement('', 'div');
    },
    querySelectorAll() { return []; },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatchEvent(event) { (listeners.get(event.type) || []).forEach((listener) => listener(event)); },
    setAttribute(name, value) { this[name] = String(value); },
    getAttribute(name) { return this[name]; },
    removeAttribute(name) { delete this[name]; },
    focus() {},
    setPointerCapture() {}
  };
  return element;
}

const elements = new Map();
const ids = [
  'game', 'intro', 'result', 'levelResult', 'level', 'score', 'timer', 'combo', 'goal', 'lives',
  'next', 'toast', 'levelResultKicker', 'levelResultTitle', 'levelResultScore', 'levelResultTiles',
  'levelResultRounds', 'levelResultText', 'levelContinue', 'leaderboard', 'leaderboardTitle',
  'leaderboardStatus', 'introAccount', 'resultAccount', 'accountDialog', 'accountClose', 'accountForm',
  'accountSignInMode', 'accountSignUpMode', 'accountSignedOut', 'accountSignedIn', 'displayNameField',
  'accountDisplayName', 'accountEmail', 'accountPassword', 'accountSubmit', 'accountPlayerName',
  'accountPlayerEmail', 'accountBest', 'accountSignOut', 'accountStatus', 'tutorial', 'tutorialVisual',
  'tutorialClose', 'tutorialPrev', 'tutorialNext', 'tutorialKicker', 'tutorialTitle', 'tutorialText',
  'swipePad', 'sound', 'soundIcon', 'start', 'restart', 'finalScore', 'resultTag', 'resultTitle',
  'resultText'
];
ids.forEach((id) => elements.set(id, makeElement(id)));
if (nativeCanvas) {
  nativeCanvas.style ||= {};
  nativeCanvas.dataset ||= {};
  nativeCanvas.addEventListener ||= (type, listener) => listen(canvasListeners, type, listener);
  nativeCanvas.removeEventListener ||= () => {};
  nativeCanvas.dispatchEvent ||= (event) => dispatch(canvasListeners, event);
  nativeCanvas.setAttribute ||= (name, value) => { nativeCanvas[name] = String(value); };
  nativeCanvas.getBoundingClientRect ||= () => ({ left: 0, top: 0, width, height, right: width, bottom: height });
  nativeCanvas.setPointerCapture ||= () => {};
}
elements.get('game').appendChild(nativeCanvas);

const documentShim = {
  documentElement: makeElement('html', 'html'),
  hidden: false,
  querySelector(selector) {
    const id = String(selector).match(/^#([\w-]+)/)?.[1];
    return id ? elements.get(id) || makeElement(id) : makeElement('', 'div');
  },
  querySelectorAll() { return []; },
  createElementNS(_namespace, name) {
    if (name === 'canvas' && nativeCanvas) return nativeCanvas;
    return makeElement('', name);
  },
  createElement(name) { return makeElement('', name); },
  addEventListener() {}
};

const navigatorShim = { maxTouchPoints: 1, vibrate: (duration) => wxApi?.vibrateShort?.({ type: duration > 10 ? 'heavy' : 'light' }) };
const performanceShim = globalThis.performance || { now: () => Date.now() };
const frame = globalThis.requestAnimationFrame || ((callback) => setTimeout(() => callback(performanceShim.now()), 16));
class SearchParams {
  constructor(query = '') { this.query = String(query); }
  has(key) { return new RegExp(`(?:^|[?&])${key}(?:=|&|$)`).test(this.query); }
  get(key) { return this.query.match(new RegExp(`(?:^|[?&])${key}=([^&]*)`))?.[1] || null; }
}
if (!globalThis.AudioContext && wxApi?.createWebAudioContext) {
  globalThis.AudioContext = function AudioContext() { return wxApi.createWebAudioContext(); };
  globalThis.webkitAudioContext = globalThis.AudioContext;
}

const storage = {
  getItem(key) { const value = wxApi?.getStorageSync?.(key); return value == null ? null : String(value); },
  setItem(key, value) { wxApi?.setStorageSync?.(key, String(value)); },
  removeItem(key) { wxApi?.removeStorageSync?.(key); }
};
const fileFetch = wxApi?.getFileSystemManager ? (filePath) => new Promise((resolve, reject) => {
    wxApi.getFileSystemManager().readFile({
      filePath: String(filePath),
      success(result) {
        const data = result.data;
        resolve({
          ok: true,
          status: 200,
          headers: { get: () => 'application/octet-stream' },
          arrayBuffer: async () => data,
          text: async () => '',
          json: async () => ({})
        });
      },
      fail(error) { reject(error); }
    });
  }) : null;

globalThis.__happyJumpPlatform = {
  canvas: nativeCanvas,
  document: documentShim,
  width,
  height,
  ratio,
  navigator: navigatorShim,
  location: { search: '' },
  performance: performanceShim,
  matchMedia: () => ({ matches: true }),
  requestAnimationFrame: frame,
  addEventListener: (type, listener) => listen(globalListeners, type, listener),
  dispatchEvent: (event) => dispatch(globalListeners, event),
  storage,
  fetch: globalThis.fetch || fileFetch,
  URLSearchParams: globalThis.URLSearchParams || SearchParams
};

globalThis.__happyJumpPlatform.loadImage = (source) => new Promise((resolve, reject) => {
  const image = wxApi.createImage();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = source;
});

export { nativeCanvas, width, height, ratio };
