import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.env.DIST ? resolve(process.env.DIST) : join(root, 'dist');
const port = Number(process.env.PORT) || 4173;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.txt': 'text/plain' };

const csp = (readFileSync(join(dist, '_headers'), 'utf8').match(/Content-Security-Policy:\s*(.+)/) || [])[1];

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
  const headers = { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' };
  if (csp) headers['content-security-policy'] = csp;
  res.writeHead(200, headers).end(readFileSync(file));
}).listen(port, () => console.log(`serving dist on http://localhost:${port}`));
