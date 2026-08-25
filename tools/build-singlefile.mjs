import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = resolve(root, 'dist-single', 'game.bundle.js');
const outputPath = resolve(root, 'dist-single', 'index.html');

const assets = [
  ['assets/sprout-ui-neutral-paper.png', 'image/png'],
  ['assets/sprout-island-arena.png', 'image/png'],
  ['assets/sprout-keyart.png', 'image/png'],
  ['assets/happy-jump-logo-v80.png', 'image/png'],
  ['assets/ui-forward-v80.png', 'image/png'],
  ['assets/ui-restart.png', 'image/png'],
  ['assets/ui-sound-off.png', 'image/png'],
  ['assets/ui-sound-on.png', 'image/png'],
  ['assets/audio/mix-v91/happyjump-bgm-bouncy-party-v91.wav', 'audio/wav'],
  ['assets/audio/mix-v92/happyjump-hop-soft-pop-v92.wav', 'audio/wav'],
  ['assets/audio/mix-v91/happyjump-level-clear-party-v91.wav', 'audio/wav'],
  ['assets/audio/mix-v91/happyjump-full-clear-party-v91.wav', 'audio/wav'],
  ['assets/audio/mix-v91/happyjump-life-lost-party-v91.wav', 'audio/wav'],
  ['assets/audio/mix-v91/happyjump-game-over-party-v91.wav', 'audio/wav'],
  ['assets/audio/mix-v91/happyjump-timeout-party-v91.wav', 'audio/wav']
];

const dataUrls = new Map();
for (const [path, mime] of assets) {
  const bytes = await readFile(resolve(root, path));
  dataUrls.set(path, `data:${mime};base64,${bytes.toString('base64')}`);
}

function inlineAssets(source) {
  let output = source;
  for (const [path, dataUrl] of dataUrls) output = output.replaceAll(path, dataUrl);
  return output;
}

let html = await readFile(resolve(root, 'index.html'), 'utf8');
let css = await readFile(resolve(root, 'style.css'), 'utf8');
let script = await readFile(bundlePath, 'utf8');
const cloudConfig = await readFile(resolve(root, 'cloud-config.js'), 'utf8');

html = html.replace(/\s*<meta property="og:image"[^>]*>/, '');
html = html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '');
css = css
  .replace('#soundIcon[src$="ui-sound-on.png"]', '#sound[aria-pressed="true"] #soundIcon')
  .replace('#soundIcon[src$="ui-sound-off.png"]', '#sound[aria-pressed="false"] #soundIcon');
css = inlineAssets(css);
script = inlineAssets(script).replaceAll('</script', '<\\/script');
html = inlineAssets(html)
  .replace(/\s*<link rel="stylesheet" href="style\.css\?v=[^"]+">/, `\n  <style>${css}</style>`)
  .replace(/\s*<script src="cloud-config\.js\?v=[^"]+"><\/script>/, `\n  <script>${cloudConfig}</script>`)
  .replace(/\s*<script type="module" src="game\.js\?v=[^"]+"><\/script>/, `\n  <script>${script}</script>`);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, html);
console.log(outputPath);
