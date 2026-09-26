#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage Static Server — tools/serve.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Serves a folder under a sub-path, the way GitHub Pages serves a project site
 * at https://<owner>.github.io/<repo>/. Anything outside the base path is a
 * 404, so a root-absolute URL ("/app.js") fails locally just as it would on
 * Pages.
 *
 * Usage: node tools/serve.js [dir=_site] [port=4173] [base=/team_green/]
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const DIR = path.resolve(process.argv[2] || '_site');
const PORT = Number(process.argv[3] || process.env.PORT || 4173);
const BASE = process.argv[4] || '/team_green/';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png'
};

http.createServer(function (req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  // Pages redirects /repo to /repo/.
  if (url + '/' === BASE) { res.writeHead(301, { Location: BASE }); return res.end(); }
  if (!url.startsWith(BASE)) { res.writeHead(404); return res.end('Not found'); }
  let file = path.join(DIR, url.slice(BASE.length));
  if (!file.startsWith(DIR)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, function (err, body) {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
}).listen(PORT, '127.0.0.1', function () {
  console.log('Serving ' + DIR + ' at http://127.0.0.1:' + PORT + BASE);
});
