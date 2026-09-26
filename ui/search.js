/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage design search — ui/search.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Simulates and costs every panel × battery mix, then picks the tiers. With
 * day-to-day weather each design is run in all WEATHER_YEARS simulated years
 * (SunEngine.evaluateYears), so no single lucky or unlucky year decides the
 * answer. The decision objective is minimax: lowest lifecycle cost in the
 * worst simulated weather year. Average cost remains visible as context.
 *
 * In the browser it works in ~25 ms slices so the page stays responsive, and
 * one result is shared by the Optimizer and Suggestions tabs and the slider
 * markers. The result is cached until a setting that changes the answer
 * changes (the design counts themselves don't). tools/report.js runs the same
 * search in Node (SunSearch.run), so the report and the app always agree.
 *
 *   SunSearch.request(settings, id, { progress(fraction), done(result) })
 *   SunSearch.cached(settings) → result or null
 *   SunSearch.run(settings) → result (synchronous)
 *   SunSearch.tierOf(result, design) → the tier that is exactly this design, or null
 *   result: { settings, grid, rows, years, best, averageBest, near, tiers: [{ n, id, name, rule, also, row }] }
 *   row: { panels, batteries, inverters, capex, genKwh, lifecycle (average), worstLifecycle, feasible }
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../engine.js'), require('../budget.js'));
  } else {
    root.SunSearch = factory(root.SunEngine, root.SunBudget);
  }
}(typeof window !== 'undefined' ? window : this, function (E, B) {
  'use strict';

  // The same 20 years the Generator tab compares the start rules over.
  var WEATHER_YEARS = 20;

  // Each tier is one design that meets every requirement, picked by a rule.
  // A tier that lands on the same design as an earlier one is folded into it.
  // Balanced is the recommendation: near the bottom of a flat cost curve the
  // design that holds up in a bad weather year is the safer buy.
  var TIERS = [
    { id: 'essential', name: 'Essential', rule: 'The lowest installed cost that meets every requirement.',
      pick: function (ok) { return lowest(ok, function (r) { return r.capex; }); } },
    { id: 'balanced', name: 'Balanced', rule: 'The lowest total cost in a bad weather year: installed plus running, in the worst of the simulated years.',
      pick: function (ok) { return lowest(ok, function (r) { return r.worstLifecycle; }); } },
    { id: 'independent', name: 'Independent', rule: 'The least generator use within 2% of the lowest worst-year total cost.',
      pick: function (ok, best, near) { return lowest(near, function (r) { return r.genKwh; }); } },
    { id: 'resilient', name: 'Resilient', rule: 'The least generator use of any design searched.',
      pick: function (ok) { return lowest(ok, function (r) { return r.genKwh; }); } }
  ];
  var RECOMMENDED = 'balanced';

  var cache = null, job = null;

  /** Weather years to run: all of them for day-to-day weather, else one. */
  function seedsFor(s) {
    if (s.weatherMode !== 'variable') return null;
    var seeds = [];
    for (var k = 1; k <= WEATHER_YEARS; k++) seeds.push(k);
    return seeds;
  }

  /** Settings that change the answer; the grid itself varies the counts. */
  function key(s) {
    var k = Object.assign({}, s);
    delete k.panels; delete k.batteries; delete k.inverters;
    if (seedsFor(s)) delete k.weatherSeed; // every year is searched anyway
    return JSON.stringify(k);
  }

  function cached(settings) { return cache && cache.key === key(settings) ? cache : null; }

  /** Every panels × batteries candidate the search runs. */
  function plan(s) {
    var grid = E.optimizerGrid(s, { panelStep: 4, batteryMax: 16 });
    var todo = [];
    grid.panels.forEach(function (p) {
      for (var b = E.minimums(p, s).batteries; b <= grid.batteryMax; b++) todo.push([p, b]);
    });
    return { grid: grid, todo: todo };
  }

  function evaluate(s, seeds, p, b) {
    if (seeds) return E.evaluateYears(s, B.costFn, p, b, seeds);
    var r = E.evaluate(s, B.costFn, p, b);
    r.worstLifecycle = r.lifecycle;
    r.years = 1;
    return r;
  }

  /** The whole search in one go (Node, tests). */
  function run(settings) {
    var s = Object.assign({}, settings), seeds = seedsFor(s), pl = plan(s);
    var rows = pl.todo.map(function (c) { return evaluate(s, seeds, c[0], c[1]); });
    return finish(key(s), s, pl.grid, rows, seeds);
  }

  function request(settings, id, handlers) {
    var hit = cached(settings);
    if (hit) { if (handlers.done) handlers.done(hit); return; }
    var k = key(settings);
    if (!job || job.key !== k) start(settings, k);
    job.listeners[id] = handlers;
  }

  function start(settings, k) {
    if (job) job.cancelled = true;
    var s = Object.assign({}, settings), seeds = seedsFor(s), pl = plan(s), todo = pl.todo;
    var me = job = { key: k, listeners: {}, cancelled: false };
    var rows = [], i = 0;
    (function tick() {
      if (me.cancelled) return;
      var until = Date.now() + 25;
      while (i < todo.length && Date.now() < until) { rows.push(evaluate(s, seeds, todo[i][0], todo[i][1])); i++; }
      if (i < todo.length) {
        notify(me, 'progress', i / todo.length);
        setTimeout(tick, 0);
        return;
      }
      cache = finish(k, s, pl.grid, rows, seeds);
      job = null;
      notify(me, 'done', cache);
    })();
  }

  function notify(j, what, arg) {
    Object.keys(j.listeners).forEach(function (id) {
      var h = j.listeners[id][what];
      if (h) h(arg);
    });
  }

  function finish(k, s, grid, rows, seeds) {
    var ok = rows.filter(function (r) { return r.feasible; });
    var averageBest = lowest(ok, function (r) { return r.lifecycle; });
    var best = lowest(ok, function (r) { return r.worstLifecycle; });
    var near = best ? ok.filter(function (r) { return r.worstLifecycle <= best.worstLifecycle * 1.02; }) : [];
    var tiers = [];
    if (best) {
      TIERS.forEach(function (t) {
        var row = t.pick(ok, best, near);
        var same = tiers.filter(function (x) { return x.row === row; })[0];
        if (same) { same.also.push(t.rule); same.recommended = same.recommended || t.id === RECOMMENDED; return; }
        tiers.push({ n: tiers.length + 1, id: t.id, name: t.name, rule: t.rule, also: [], row: row,
                     recommended: t.id === RECOMMENDED });
      });
    }
    return { key: k, settings: s, grid: grid, rows: rows, years: seeds ? seeds.length : 1,
             best: best, averageBest: averageBest, near: near, tiers: tiers };
  }

  /** The row with the smallest fn(row); ties go to the lower average lifetime cost. */
  function lowest(list, fn) {
    return list.reduce(function (a, r) {
      if (!a) return r;
      var d = fn(r) - fn(a);
      return d < 0 || (d === 0 && r.lifecycle < a.lifecycle) ? r : a;
    }, null);
  }

  /** The tier that is exactly this design (same panels, batteries, inverters), if any. */
  function tierOf(result, d) {
    if (!result) return null;
    return result.tiers.filter(function (t) {
      return t.row.panels === d.panels && t.row.batteries === d.batteries && t.row.inverters === d.inverters;
    })[0] || null;
  }

  return { request: request, cached: cached, run: run, tierOf: tierOf, TIERS: TIERS, WEATHER_YEARS: WEATHER_YEARS };
}));
