#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage CLI Test Runner — tests/run-tests.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Runs the whole suite in Node (no browser). The source modules are UMD, so
 * they're required directly and exposed as the globals the tests expect.
 *
 * Usage: node tests/run-tests.js
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = vm.createContext({
  console: console,
  Math: Math,
  Object: Object,
  Array: Array,
  JSON: JSON,
  Error: Error,
  Number: Number,
  String: String,
  Infinity: Infinity,
  isFinite: isFinite,
  SunData: require('../data.js'),
  SunEngine: require('../engine.js'),
  SunBudget: require('../budget.js'),
  SunSettings: require('../settings.js'),
  // The shared runner also renders an HTML report; there is no DOM in Node.
  document: { getElementById: function () { return null; } },
});
context.window = context;

function loadScript(file) {
  const abs = path.resolve(__dirname, file);
  new vm.Script(fs.readFileSync(abs, 'utf8'), { filename: abs }).runInContext(context);
}

loadScript('test-runner.js');
loadScript('engine.test.js');
loadScript('budget.test.js');

const start = Date.now();
const results = context.TestRunner.run();
console.log('\nTime: ' + (Date.now() - start) + 'ms\n');
process.exit(results.failed > 0 ? 1 : 0);
