// A tiny static server for the repository root. Sends Cache-Control: no-store
// so a browser never runs a stale module after an edit (see AGENTS.md).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.SF_ROOT ? path.resolve(process.env.SF_ROOT) : path.resolve(__dirname, '../../../..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

function serve(root = ROOT) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) file = path.join(file, 'index.html');
      fs.readFile(file, (e, buf) => {
        if (e) { res.writeHead(404, { 'Cache-Control': 'no-store' }); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(buf);
      });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
  }));
}

module.exports = { serve, ROOT };
