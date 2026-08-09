import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const preferredPort = Number.parseInt(process.env.PORT || '4175', 10);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function openBrowser(url) {
  if (!process.argv.includes('--open')) return;
  const command = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function resolveRequestPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const normalized = normalize(relative);
  if (normalized.startsWith('..') || normalized.includes(':')) return null;
  return join(root, normalized);
}

function listen(port) {
  const server = createServer(async (request, response) => {
    const filePath = resolveRequestPath(request.url || '/');
    if (!filePath) {
      response.writeHead(400).end('Bad request');
      return;
    }
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error('Not a file');
      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream'
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });

  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && port < preferredPort + 20) listen(port + 1);
    else throw error;
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`Sprout Bounce Grid: ${url}`);
    console.log('Press Ctrl+C to stop.');
    openBrowser(url);
  });
}

listen(preferredPort);
