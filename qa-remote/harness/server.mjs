import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CDA_ROOT
  ? path.resolve(process.env.CDA_ROOT)
  : path.resolve(here, '../audit-cdayco-pr');
const csp = "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; script-src-attr 'none'; img-src 'self' data:; connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com; frame-ancestors 'none'";

function targetFor(urlPath) {
  let decoded = decodeURIComponent(urlPath);
  if (decoded === '/') decoded = '/index.html';
  const candidates = path.extname(decoded)
    ? [decoded]
    : [`${decoded}.html`, `${decoded}/index.html`];

  for (const candidate of candidates) {
    const target = path.resolve(root, `.${candidate}`);
    if (target.startsWith(root + path.sep) && fs.existsSync(target)) return target;
  }
  return null;
}

const server = http.createServer((req, res) => {
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'POST' && req.url === '/api/contact') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      console.log(`API_POST ${body}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
    return;
  }

  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const target = targetFor(pathname);
  if (!target || !fs.existsSync(target)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }

  const ext = path.extname(target);
  const type = ext === '.html' ? 'text/html; charset=utf-8'
    : ext === '.css' ? 'text/css; charset=utf-8'
      : ext === '.js' ? 'text/javascript; charset=utf-8'
        : ext === '.svg' ? 'image/svg+xml'
          : ext === '.woff2' ? 'font/woff2'
            : 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(target).pipe(res);
});

server.listen(8766, '127.0.0.1', () => {
  console.log('AUDIT_SERVER_READY http://127.0.0.1:8766');
});
