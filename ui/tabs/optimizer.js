/**
 * Optimizer tab — ui/tabs/optimizer.js
 * Every panel × battery mix from the design search (ui/search.js), coloured
 * by worst-year cost (installed + discounted running costs). The numbered squares
 * are the Suggestions tiers; click any square to load that design.
 */
(function () {
  'use strict';

  var U = window.SunUI, C = window.SunCharts, Search = window.SunSearch;
  var app = null;

  U.tab({
    id: 'optimizer',
    title: 'Optimizer',
    intro: function (m) {
      var years = m.s.weatherMode === 'variable' ? Search.WEATHER_YEARS + ' simulated weather years' : 'a full year';
      return 'Every mix of panels and batteries, each simulated hour by hour over ' + years + ' and costed over ' + m.d.horizonYears +
        ' years. The recommendation minimizes cost in the worst simulated weather year.';
    },
    html:
      U.card('Cost of every design',
        U.caption('Each square is one design: panels across, batteries up, coloured by its worst-year 25-year cost. ' +
          'Lighter is cheaper; grey fails a requirement. The outlined square is the minimax recommendation. Click any square to load it.') +
        '<div id="heatmap" class="chart"></div><p class="muted" id="optNote"></p>',
        '<span class="progress" id="optProgress" hidden><span id="optBar"></span></span>'),

    init: function (a) { app = a; },

    render: function (m) {
      Search.request(m.s, 'optimizer', {
        progress: function (f) {
          U.$('optProgress').hidden = false;
          U.$('optBar').style.width = (f * 100) + '%';
        },
        done: function (r) {
          U.$('optProgress').hidden = true;
          draw(r);
        }
      });
      if (!Search.cached(m.s)) {
        U.$('heatmap').innerHTML = '<p class="muted">Simulating every design…</p>';
        U.$('optNote').textContent = '';
      }
    }
  });

  function draw(r) {
    var panels = r.grid.panels, bats = [], lookup = {}, years = r.settings.horizonYears;
    for (var b = r.grid.batteryMax; b >= 1; b--) {
      if (r.rows.some(function (x) { return x.batteries === b; })) bats.push(b);
    }
    r.rows.forEach(function (x) { lookup[x.panels + ':' + x.batteries] = x; });
    function at(i, j) { return lookup[panels[j] + ':' + bats[i]]; }
    function cell(x) { return { r: bats.indexOf(x.batteries), c: panels.indexOf(x.panels) }; }

    C.heatmap(U.$('heatmap'), {
      rows: bats.map(String), cols: panels.map(String),
      rowTitle: 'batteries', colTitle: 'panels (440 W)',
      value: function (i, j) { var x = at(i, j); return x && x.feasible ? x.worstLifecycle : null; },
      fmt: U.money, capRatio: 1.5, emptyLabel: 'fails a requirement',
      highlight: r.best ? cell(r.best) : null,
      marks: r.tiers.map(function (t) { var c = cell(t.row); c.label = t.n; return c; }),
      tip: function (i, j) {
        var x = at(i, j);
        if (!x) return 'Below datasheet minimum';
        var t = r.tiers.filter(function (k) { return k.row === x; })[0];
        return '<div class="tip-title">' + x.panels + ' panels · ' + x.batteries + ' batteries · ' + x.inverters + ' inverters</div>' +
          (t ? 'Tier ' + t.n + ' · ' + t.name + '<br>' : '') +
          years + '-year cost <b>' + U.money(x.worstLifecycle) + '</b> in the worst year' + (r.years > 1 ? ', ' + U.money(x.lifecycle) + ' on average' : '') +
          '<br>Installed ' + U.money(x.capex) + '<br>Generator ' + U.kwh(x.genKwh) + ' a year' + (r.years > 1 ? ' on average' : '') +
          (x.feasible ? '' : '<br><b>Fails a requirement</b>');
      },
      onClick: function (i, j) { app.loadDesign(panels[j], bats[i]); }
    });

    U.$('optNote').textContent = r.best
      ? r.near.length + ' designs are within 2% of the lowest worst-year cost. The outlined design is the stated minimax recommendation.'
      : 'No design meets every requirement within the site limit.';
  }
})();
