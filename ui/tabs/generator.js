/**
 * Generator tab — ui/tabs/generator.js
 * How the existing generator is automated, what that saves versus a plain
 * battery-level trigger, and what it costs over the system's life.
 */
(function () {
  'use strict';

  var U = window.SunUI, C = window.SunCharts, E = window.SunEngine, EQ = window.SunData.EQUIPMENT;
  var lastKey = null;

  U.tab({
    id: 'generator',
    title: 'Generator',
    intro: 'The 6 kW generator only runs when the solar forecast says the battery will fall short.',
    html:
      U.card('How the automation decides', '<div id="automation"></div>') +
      U.card('Forecast-aware vs. battery-level trigger, 20 weather years',
        '<div id="compareOut"><p class="muted">Simulates both strategies over 20 different weather years.</p></div>',
        '<button class="btn" id="compareBtn" type="button">Run comparison</button>') +
      U.card('Generator cost by year', '<div id="genYearChart" class="chart"></div><div id="genYearTable"></div>'),

    init: function (app) {
      U.$('compareBtn').addEventListener('click', function () { compare(app.model()); });
    },

    render: function (m) {
      renderAutomation(m.d);
      renderLifetime(m);
      // Re-run the comparison whenever the design changes.
      var key = JSON.stringify(m.s);
      if (key !== lastKey) { lastKey = key; compare(m); }
    }
  });

  function step(n, title, body) {
    return '<div class="step"><span class="step-n">' + n + '</span><h4>' + title + '</h4>' + body + '</div>';
  }

  function renderAutomation(d) {
    U.$('automation').innerHTML = '<div class="steps">' +
      step(1, 'Read', '<ul><li>Battery charge (BMS)</li><li>Home load and solar (CTs)</li><li>36-hour solar forecast</li></ul>') +
      step(2, 'Decide', '<p>Project the battery 36 h ahead. Start only if it would drop below ' + d.minSocPct + '% + ' + d.reserveKwh +
        ' kWh reserve within the next hour.</p>') +
      step(3, 'Act', '<p>Run ≥ ' + d.genMinRunH + ' h at full output, then stop as soon as the forecast covers the gap, so tomorrow\'s sun isn\'t wasted.</p>') +
      '</div>' +
      '<details class="more-inline"><summary>Details</summary><div class="prose">' +
      '<p><b>Wiring.</b> The BE7500ID moves from the manual transfer switch to the GridBOSS GEN port (125 A; the generator draws 25 A at 240 V). A 2-wire start kit lets the GridBOSS start and stop it.</p>' +
      '<p><b>Baseline for comparison.</b> A conventional trigger: on at ' + d.socStartPct + '%, off at ' + d.socStopPct + '%. It often fills the battery the night before a sunny day, and that sun is then curtailed.</p>' +
      '<p><b>Modelled limits.</b> Forecast error σ = ' + d.forecastErrorPct + '%/day, minimum run time, generator and charger capacity, 140 A per battery, and a last-resort start if load would go unserved. Service every 100 kWh costs 2% efficiency; the unit is replaced below ' + Math.round(d.genReplaceAtEff * 100) + '%.</p>' +
      '</div></details>';
  }

  function renderLifetime(m) {
    var d = m.d, years = m.life.years;
    C.stackedBars(U.$('genYearChart'), {
      labels: years.map(function (y) { return String(y.year); }), unit: '$', height: 200,
      series: [{ name: 'Generator cost', color: U.COLORS.gen, values: years.map(function (y) { return y.generator; }) }],
      tipTitle: function (i) { var y = years[i]; return 'Year ' + y.year + ' · ' + U.kwh(y.genKwh) + ' · ' + y.genServices + ' services' + (y.genReplacements ? ' · replaced' : ''); }
    });
    U.$('genYearTable').innerHTML = '<p class="muted">Over ' + d.horizonYears + ' years: ' +
      U.kwh(U.sum(years, function (y) { return y.genKwh; })) + ', ' +
      U.sum(years, function (y) { return y.genServices; }) + ' services, ' +
      U.sum(years, function (y) { return y.genReplacements; }) + ' replacement(s), ' +
      U.money(U.sum(years, function (y) { return y.generator; })) + ' nominal. Use creeps up as panels age ' + EQ.panel.degradationPctPerYr + '%/yr.</p>';
  }

  /** Simulate both strategies over 20 seeded weather years. */
  function compare(m) {
    var btn = U.$('compareBtn');
    btn.disabled = true;
    btn.textContent = 'Running…';
    setTimeout(function () {
      var res = {};
      ['smart', 'soc'].forEach(function (strategy) {
        res[strategy] = [];
        for (var seed = 1; seed <= 20; seed++) {
          var dd = Object.assign({}, m.d, { weatherMode: 'variable', weatherSeed: seed });
          res[strategy].push(E.simulateSteadyYear(dd, { strategy: strategy }).totals);
        }
      });
      function q(key, st, p) {
        var a = res[st].map(function (t) { return t[key]; }).sort(function (x, y) { return x - y; });
        return a[Math.min(a.length - 1, Math.floor(p * a.length))];
      }
      function row(name, st) {
        return [name, U.kwh(q('gen', st, 0.5)), U.kwh(q('gen', st, 0.9)), U.money(q('genCost', st, 0.5)), q('genStarts', st, 0.5), U.kwh(q('curtailed', st, 0.5))];
      }
      var smart = U.sum(res.smart, function (t) { return t.genCost; }) / 20;
      var soc = U.sum(res.soc, function (t) { return t.genCost; }) / 20;
      U.$('compareOut').innerHTML =
        '<p class="callout">Forecast-aware saves <b>' + U.money(soc - smart) + '/yr</b> (' + (soc > 0 ? ((soc - smart) / soc * 100).toFixed(0) : 0) + '%) on generator cost for this design.</p>' +
        U.table(
          [{ t: 'Strategy' }, { t: 'Generator, typical', num: true }, { t: 'Bad year (P90)', num: true }, { t: 'Cost, typical', num: true }, { t: 'Starts', num: true }, { t: 'Solar wasted', num: true }],
          [row('Forecast-aware', 'smart'), row('Battery-level trigger', 'soc')],
          { rowClass: function (i) { return i === 0 ? 'best' : ''; } }
        );
      btn.disabled = false;
      btn.textContent = 'Run again';
    }, 20);
  }
})();
