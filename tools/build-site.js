#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage Site Builder — tools/build-site.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Copies exactly what GitHub Pages serves into _site/. The e2e suite runs
 * against this folder, so what is tested is what is deployed.
 *
 * Usage: node tools/build-site.js [outDir]
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.argv[2] || '_site');

// Site files, plus the browser test page and the markdown reports it links to.
const FILES = ['index.html', 'styles.css', 'data.js', 'engine.js', 'budget.js', 'settings.js', 'charts.js', 'app.js'];
const DIRS = ['tests', 'docs'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
FILES.forEach(function (f) { fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f)); });
DIRS.forEach(function (d) { fs.cpSync(path.join(ROOT, d), path.join(OUT, d), { recursive: true }); });
// Serve files as-is: no Jekyll processing of underscores or markdown.
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log('Built ' + path.relative(ROOT, OUT) + '/ (' + FILES.length + ' files + ' + DIRS.join(', ') + ')');
