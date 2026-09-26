/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage design search — ui/search.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Simulates and costs every panel × battery mix (SunEngine.evaluate), then
 * picks the tiers. It works in ~25 ms slices so the page stays responsive,
 * and one result is shared by the Optimizer and Suggestions tabs and the
 * slider markers. The result is cached until a setting that changes the
 * answer changes (the design counts themselves don't).
 *
 *   SunSearch.request(settings, id, { progress(fraction), done(result) })
 *   SunSearch.cached(settings) → result or null
 *   SunSearch.tierOf(result, design) → the tier that is exactly this design, or null
 *   result: { settings, grid, rows, best, near, tiers: [{ n, id, name, rule, also, row }] }
 * ═══════════════════════════════════════════════════════════════════════════════
 */

window.SunSearch = (function () {
  'use strict';

  var E = window.SunEngine, B = window.SunBudget;

  // Each tier is one design that meets every requirement, picked by a rule.
  // A tier that lands on the same design as an earlier one is folded into it.
  var TIERS = [
    { id: 'essential', name: 'Essential', rule: 'The lowest installed cost that meets every requirement.',
      pick: function (ok) { return lowest(ok, function (r) { return r.capex; }); } },
    { id: 'balanced', name: 'Balanced', rule: 'The lowest total cost: installed plus running, over the whole period.',
      pick: function (ok, best) { return best; } },
    { id: 'independent', name: 'Independent', rule: 'The least generator use within 2% of that lowest total cost.',
      pick: function (ok, best, near) { return lowest(near, function (r) { return r.genKwh; }); } },
    { id: 'resilient', name: 'Resilient', rule: 'The least generator use of any design searched.',
      pick: function (ok) { return lowest(ok, function (r) { return r.genKwh; }); } }
  ];

  var cache = null, job = null;

  /** Settings that change the answer; the grid itself varies the counts. */
  function key(s) {
    var k = Object.assign({}, s);
    delete k.panels; delete k.batteries; delete k.inverters;
    return JSON.stringify(k);
  }

  function cached(settings) { return cache && cache.key === key(settings) ? cache : null; }

  function request(settings, id, handlers) {
    var hit = cached(settings);
    if (hit) { if (handlers.done) handlers.done(hit); return; }
    var k = key(settings);
    if (!job || job.key !== k) start(settings, k);
    job.listeners[id] = handlers;
  }

  function start(settings, k) {
    if (job) job.cancelled = true;
    var s = Object.assign({}, settings);
    var grid = E.optimizerGrid(s, { panelStep: 4, batteryMax: 16 });
    var todo = [];
    grid.panels.forEach(function (p) {
      for (var b = E.minimums(p, s).batteries; b <= grid.batteryMax; b++) todo.push([p, b]);
    });
    var me = job = { key: k, listeners: {}, cancelled: false };
    var rows = [], i = 0;
    (function tick() {
      if (me.cancelled) return;
      var until = Date.now() + 25;
      while (i < todo.length && Date.now() < until) { rows.push(E.evaluate(s, B.costFn, todo[i][0], todo[i][1])); i++; }
      if (i < todo.length) {
        notify(me, 'progress', i / todo.length);
        setTimeout(tick, 0);
        return;
      }
      cache = finish(k, s, grid, rows);
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

  function finish(k, s, grid, rows) {
    var ok = rows.filter(function (r) { return r.feasible; });
    var best = lowest(ok, function (r) { return r.lifecycle; });
    var near = best ? ok.filter(function (r) { return r.lifecycle <= best.lifecycle * 1.02; }) : [];
    var tiers = [];
    if (best) {
      TIERS.forEach(function (t) {
        var row = t.pick(ok, best, near);
        var same = tiers.filter(function (x) { return x.row === row; })[0];
        if (same) { same.also.push(t.rule); return; }
        tiers.push({ n: tiers.length + 1, id: t.id, name: t.name, rule: t.rule, also: [], row: row });
      });
    }
    return { key: k, settings: s, grid: grid, rows: rows, best: best, near: near, tiers: tiers };
  }

  /** The row with the smallest fn(row); ties go to the lower lifetime cost. */
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

  return { request: request, cached: cached, tierOf: tierOf, TIERS: TIERS };
})();
