/**
 * Optimizer tab — ui/tabs/optimizer.js
 * Tries every panel × battery combination and ranks them by lifecycle cost
 * (capital + discounted operating cost). Click a cell to load that design.
 */
(function () {
  'use strict';

  var U = window.SunUI, C = window.SunCharts, E = window.SunEngine, B = window.SunBudget;
  var result = null, running = false, app = null;

  U.tab({
    id: 'optimizer',
    title: 'Optimizer',
    intro: 'Every panel × battery combination, each simulated for a full year and priced over its life.',
    html:
      U.card('Lifecycle cost by design',
        '<p class="muted">Lighter is cheaper. Grey fails a requirement. The outlined cell is the cheapest; click any cell to load it.</p>' +
        '<div id="heatmap" class="chart"></div><p class="muted" id="optStale" hidden>Settings changed since this run.</p>',
        '<div class="card-actions"><span class="progress" id="optProgress" hidden><span id="optBar"></span></span>' +
        '<button class="btn" id="optBtn" type="button">Run optimizer</button></div>') +
      U.card('Shortlist', '<div id="alternatives"><p class="muted">Run the optimizer to compare designs.</p></div>'),

    init: function (a) {
      app = a;
      U.$('optBtn').addEventListener('click', function () { run(app.model().s); });
    },

    render: function (m) {
      if (!result && !running) return run(m.s);
      if (result) {
        U.$('optStale').hidden = key(result.settings) === key(m.s);
        draw();
      }
    }
  });

  /** Settings that change the answer (the grid itself varies the counts). */
  function key(s) {
    var k = Object.assign({}, s);
    delete k.panels; delete k.batteries; delete k.inverters;
    return JSON.stringify(k);
  }

  /** Evaluate one panel count per tick so the page stays responsive. */
  function run(settings) {
    var s = Object.assign({}, settings);
    var grid = E.optimizerGrid(s, { panelStep: 4, batteryMax: 16 });
    var rows = [], i = 0, btn = U.$('optBtn');
    running = true;
    btn.disabled = true;
    U.$('optProgress').hidden = false;
    (function next() {
      if (i >= grid.panels.length) {
        var best = null;
        rows.forEach(function (r) { if (r.feasible && (!best || r.lifecycle < best.lifecycle)) best = r; });
        result = { rows: rows, best: best, grid: grid, settings: s };
        running = false;
        btn.disabled = false;
        btn.textContent = 'Run again';
        U.$('optProgress').hidden = true;
        U.$('optStale').hidden = true;
        draw();
        return;
      }
      var p = grid.panels[i++];
      for (var b = E.minimums(p, s).batteries; b <= grid.batteryMax; b++) rows.push(E.evaluate(s, B.costFn, p, b));
      U.$('optBar').style.width = (i / grid.panels.length * 100) + '%';
      setTimeout(next, 0);
    })();
  }

  function draw() {
    var o = result, panels = o.grid.panels, bats = [], lookup = {};
    for (var b = o.grid.batteryMax; b >= 1; b--) {
      if (o.rows.some(function (r) { return r.batteries === b; })) bats.push(b);
    }
    o.rows.forEach(function (r) { lookup[r.panels + ':' + r.batteries] = r; });
    function at(r, c) { return lookup[panels[c] + ':' + bats[r]]; }

    C.heatmap(U.$('heatmap'), {
      rows: bats.map(String), cols: panels.map(String),
      rowTitle: 'batteries', colTitle: 'panels (440 W)',
      value: function (r, c) { var x = at(r, c); return x && x.feasible ? x.lifecycle : null; },
      fmt: U.money, capRatio: 1.5, emptyLabel: 'fails requirements',
      highlight: o.best ? { r: bats.indexOf(o.best.batteries), c: panels.indexOf(o.best.panels) } : null,
      tip: function (r, c) {
        var x = at(r, c);
        if (!x) return 'Below datasheet minimum';
        return '<div class="tip-title">' + x.panels + ' panels · ' + x.batteries + ' batteries · ' + x.inverters + ' inverters</div>' +
          'Lifecycle <b>' + U.money(x.lifecycle) + '</b><br>Capital ' + U.money(x.capex) + '<br>Generator ' + U.kwh(x.genKwh) + '/yr' +
          (x.feasible ? '' : '<br><b>Fails requirements</b>');
      },
      onClick: function (r, c) { app.loadDesign(panels[c], bats[r]); }
    });

    var ok = o.rows.filter(function (r) { return r.feasible; });
    if (!ok.length) { U.$('alternatives').innerHTML = '<p class="muted">No design meets the requirements within the site limit.</p>'; return; }
    function min(fn) { return ok.reduce(function (a, r) { return fn(r) < fn(a) ? r : a; }); }
    var near = ok.filter(function (r) { return r.lifecycle <= o.best.lifecycle * 1.02; });
    var picks = [
      ['Cheapest over its life', o.best],
      ['Least capital within 2% of that', near.reduce(function (a, r) { return r.capex < a.capex ? r : a; })],
      ['Least capital that still passes', min(function (r) { return r.capex; })],
      ['Least generator use', min(function (r) { return r.genKwh * 1e7 + r.lifecycle; })]
    ];
    U.$('alternatives').innerHTML = U.table(
      [{ t: '' }, { t: 'Panels', num: true }, { t: 'Batteries', num: true }, { t: 'Capital', num: true }, { t: 'Generator/yr', num: true }, { t: 'Lifecycle', num: true }, { t: '' }],
      picks.map(function (a) {
        var r = a[1];
        return [a[0], r.panels, r.batteries, U.money(r.capex), U.kwh(r.genKwh), U.money(r.lifecycle),
          '<button class="btn-link" type="button" data-p="' + r.panels + '" data-b="' + r.batteries + '">Load</button>'];
      }),
      { rowClass: function (i) { return i === 0 ? 'best' : ''; } }
    ) + '<p class="muted">' + near.length + ' designs are within 2% of the cheapest: the cost curve is flat near the bottom, so budget, roof space and risk can decide.</p>';
    U.$('alternatives').querySelectorAll('button[data-p]').forEach(function (btn) {
      btn.addEventListener('click', function () { app.loadDesign(+btn.dataset.p, +btn.dataset.b); });
    });
  }
})();
