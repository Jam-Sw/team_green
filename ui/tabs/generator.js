/**
 * Generator tab — ui/tabs/generator.js
 * How the existing generator is automated, what that saves versus a plain
 * battery-level rule, and what it costs over the system's life.
 */
(function () {
  'use strict';

  var U = window.SunUI, C = window.SunCharts, E = window.SunEngine, EQ = window.SunData.EQUIPMENT;
  var lastKey = null;

  U.tab({
    id: 'generator',
    title: 'Generator',
    intro: function (m) {
      var d = m.d;
      return d.genStrategy === 'smart'
        ? 'The existing 6 kW generator only runs when the solar forecast says the battery will fall short.'
        : 'The generator starts when the battery falls to ' + d.socStartPct + '% and stops at ' + d.socStopPct +
          '%. Set Generator → Start rule to Forecast-aware to compare.';
    },
    html:
      U.card('How the automation decides', '<div id="automation"></div>') +
      U.card('Forecast-aware vs. a simple battery-level rule',
        U.caption('Both rules run on the same 20 simulated weather years. "Typical" is the middle year; a "bad year" is worse than 9 in 10.') +
        '<div id="compareOut"><p class="muted">Simulating…</p></div>',
        '<button class="btn" id="compareBtn" type="button">Run comparison</button>') +
      U.card('Generator cost by year', U.caption('', 'genCaption') + '<div id="genYearChart" class="chart"></div><div id="genYearTable"></div>'),

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
      step(1, 'Read', '<ul><li>Battery level</li><li>Home use and solar output</li><li>36-hour solar forecast</li></ul>') +
      step(2, 'Decide', '<p>Project the battery 36 h ahead. Start only if it would fall below ' + d.minSocPct + '% plus a ' + d.reserveKwh +
        ' kWh safety margin within the next hour.</p>') +
      step(3, 'Act', '<p>Run at least ' + d.genMinRunH + ' h at full output, then stop once the forecast covers the gap, so tomorrow\'s sun isn\'t wasted.</p>') +
      '</div>' +
      '<details class="more-inline"><summary>Show the details</summary><div class="prose">' +
      '<p><b>Wiring.</b> The BE7500ID moves from the manual transfer switch to the GridBOSS generator port (rated 125 A; the generator draws 25 A at 240 V). A 2-wire start kit lets the GridBOSS start and stop it.</p>' +
      '<p><b>What it is compared with.</b> A common battery-level rule: start at ' + d.socStartPct + '%, stop at ' + d.socStopPct + '%. It often fills the battery the night before a sunny day, and that sun then goes unused.</p>' +
      '<p><b>What the simulation includes.</b> A ' + d.forecastErrorPct + '% daily forecast error, the minimum run time, generator and charger limits, 140 A per battery, and a last-resort start if the home would lose power.</p>' +
      '</div></details>';
  }

  function renderLifetime(m) {
    var d = m.d, years = m.life.years;
    U.$('genCaption').textContent = 'Fuel plus a service every 100 kWh. Each service costs 2% efficiency, so costs creep up until the generator is replaced at ' +
      Math.round(d.genReplaceAtEff * 100) + '%.';
    C.stackedBars(U.$('genYearChart'), {
      labels: years.map(function (y) { return String(y.year); }), unit: '$', height: 200,
      series: [{ name: 'Generator cost', color: U.COLORS.gen, values: years.map(function (y) { return y.generator; }) }],
      tipTitle: function (i) { var y = years[i]; return 'Year ' + y.year + ' · ' + U.kwh(y.genKwh) + ' · ' + y.genServices + ' services' + (y.genReplacements ? ' · replaced' : ''); }
    });
    U.$('genYearTable').innerHTML = '<p class="muted">Over ' + d.horizonYears + ' years: ' +
      U.kwh(U.sum(years, function (y) { return y.genKwh; })) + ', ' +
      U.sum(years, function (y) { return y.genServices; }) + ' services, ' +
      U.sum(years, function (y) { return y.genReplacements; }) + ' replacement(s), ' +
      U.money(U.sum(years, function (y) { return y.generator; })) + ' before discounting. Use creeps up as the panels age ' + EQ.panel.degradationPctPerYr + '% a year.</p>';
  }

  /** Simulate both rules over 20 seeded weather years. */
  function compare(m) {
    var btn = U.$('compareBtn');
    btn.disabled = true;
    btn.textContent = 'Running…';
    setTimeout(function () {
      var res = {};
      ['smart', 'soc'].forEach(function (rule) {
        res[rule] = [];
        for (var seed = 1; seed <= 20; seed++) {
          var dd = Object.assign({}, m.d, { weatherMode: 'variable', weatherSeed: seed });
          res[rule].push(E.simulateSteadyYear(dd, { strategy: rule }).totals);
        }
      });
      function q(key, rule, p) {
        var a = res[rule].map(function (t) { return t[key]; }).sort(function (x, y) { return x - y; });
        return a[Math.min(a.length - 1, Math.floor(p * a.length))];
      }
      function row(name, rule) {
        return [name, U.kwh(q('gen', rule, 0.5)), U.kwh(q('gen', rule, 0.9)), U.money(q('genCost', rule, 0.5)), q('genStarts', rule, 0.5), U.kwh(q('curtailed', rule, 0.5))];
      }
      var smart = U.sum(res.smart, function (t) { return t.genCost; }) / 20;
      var soc = U.sum(res.soc, function (t) { return t.genCost; }) / 20;
      var saved = soc - smart;
      U.$('compareOut').innerHTML = '<p class="callout">' + (saved >= 0
          ? 'Forecast-aware saves <b>' + U.money(saved) + ' a year</b> (' + (soc > 0 ? (saved / soc * 100).toFixed(0) : 0) + '%) on generator costs for this design.'
          : 'On this design the battery-level rule is cheaper by <b>' + U.money(-saved) + ' a year</b>.') + '</p>' +
        U.table(
          [{ t: 'Rule' }, { t: 'Generator, typical', num: true }, { t: 'Generator, bad year', num: true }, { t: 'Cost, typical', num: true }, { t: 'Starts', num: true }, { t: 'Unused solar', num: true }],
          [row('Forecast-aware', 'smart'), row('Battery level', 'soc')],
          { rowClass: function (i) { return i === 0 ? 'best' : ''; } }
        );
      btn.disabled = false;
      btn.textContent = 'Run again';
    }, 20);
  }
})();
