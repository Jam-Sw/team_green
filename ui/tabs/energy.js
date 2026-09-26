/**
 * Energy tab — ui/tabs/energy.js
 * Where each hour's energy comes from, month by month, and how long the
 * battery lasts with no generator.
 */
(function () {
  'use strict';

  var U = window.SunUI, C = window.SunCharts, D = window.SunData, E = window.SunEngine;
  var EQ = D.EQUIPMENT, COLORS = U.COLORS;
  var season = 'winter';

  U.tab({
    id: 'energy',
    title: 'Energy',
    intro: 'A full simulated year, hour by hour. The home uses solar first, then the battery, then the generator.',
    html:
      U.card('Average day',
        U.caption('Each bar is one hour, split by where the home\'s power came from. The line is what the home uses.') +
        '<div id="dayChart" class="chart"></div><h4>Battery level through the same day</h4><div id="daySocChart" class="chart"></div>',
        '<div class="seg" id="seasonSeg"></div>') +
      U.card('Month by month', U.caption('', 'monthCaption') +
        '<div id="monthChart" class="chart"></div><details class="more-inline"><summary>Show the numbers</summary><div id="monthTable"></div></details>') +
      U.card('Battery level, every hour of the year', U.caption('', 'yearCaption') + '<div id="socChart" class="chart"></div>') +
      U.card('Backup with no generator', U.caption('How long a full battery lasts with the generator off.') + '<div id="autonomyTable"></div>'),

    render: function (m) {
      U.segmented(U.$('seasonSeg'), D.SEASONS.map(function (se) { return { v: se.id, t: se.name }; }), season, function (v) {
        season = v;
        renderDay(m);
      });
      renderDay(m);
      renderMonths(m);
      renderYear(m);
      renderAutonomy(m);
    }
  });

  /** "Jan", "Jan and Feb", "Jan, Feb and Dec" */
  function list(names) {
    return names.length < 3 ? names.join(' and ') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  /** Average each hourly series over the days of one season. */
  function averageDay(sim, seasonId) {
    var keys = ['load', 'direct', 'discharge', 'gen', 'curtailed', 'soc', 'pv', 'genToBattery'];
    var out = {}, days = 0;
    keys.forEach(function (k) { out[k] = new Array(24).fill(0); });
    for (var day = 0; day < 365; day++) {
      if (E.seasonOfDay(day).id !== seasonId) continue;
      days++;
      for (var h = 0; h < 24; h++) keys.forEach(function (k) { out[k][h] += sim.hourly[k][day * 24 + h]; });
    }
    keys.forEach(function (k) { out[k] = out[k].map(function (v) { return v / days; }); });
    return out;
  }

  function renderDay(m) {
    var day = averageDay(m.sim, season);
    var genToHome = day.gen.map(function (g, i) { return Math.max(0, g - day.genToBattery[i] / EQ.inverter.effAcToBattery); });
    var labels = []; for (var h = 0; h < 24; h++) labels.push(('0' + h).slice(-2));
    C.stackedBars(U.$('dayChart'), {
      labels: labels, unit: 'kWh', height: 240, labelEvery: 2,
      tipTitle: function (i) { return labels[i] + ':00 · solar made ' + day.pv[i].toFixed(2) + ' kWh, unused ' + day.curtailed[i].toFixed(2); },
      series: [
        { name: 'Solar → home', color: COLORS.solar, values: day.direct },
        { name: 'Battery → home', color: COLORS.battery, values: day.discharge },
        { name: 'Generator → home', color: COLORS.gen, values: genToHome }
      ],
      line: { name: 'Home use', color: COLORS.load, values: day.load }
    });
    C.line(U.$('daySocChart'), {
      values: day.soc.map(function (v) { return v * 100; }), max: 100, unit: '%', height: 130, color: COLORS.battery, area: true,
      xTicks: [0, 6, 12, 18, 23].map(function (i) { return { i: i, label: labels[i] }; }),
      tip: function (i) { return '<div class="tip-title">' + labels[i] + ':00</div>Average level <b>' + (day.soc[i] * 100).toFixed(0) + '%</b>'; }
    });
  }

  function renderMonths(m) {
    var M = m.sim.byMonth;
    var genMonths = D.MONTH_NAMES.filter(function (_, i) { return M[i].gen > 1; });
    U.$('monthCaption').textContent =
      !genMonths.length ? 'Solar and the battery cover every month; the generator never runs.'
      : genMonths.length <= 6 ? 'Solar covers most months. The generator fills the gap in ' + list(genMonths) + '.'
      : 'The generator runs in ' + genMonths.length + ' of 12 months. More panels or batteries would cut that.';

    C.stackedBars(U.$('monthChart'), {
      labels: D.MONTH_NAMES.slice(), unit: 'kWh', height: 240,
      series: [
        { name: 'Solar used', color: COLORS.solar, values: M.map(function (x) { return x.solarUsed; }) },
        { name: 'Generator', color: COLORS.gen, values: M.map(function (x) { return x.gen; }) }
      ],
      line: { name: 'Home use', color: COLORS.load, values: M.map(function (x) { return x.load; }) },
      tipTitle: function (i) { return D.MONTH_NAMES[i] + ' · unused solar ' + U.kwh(M[i].curtailed); }
    });
    var rows = [['Home use', 'load'], ['Solar produced', 'pv'], ['Solar used', 'solarUsed'], ['Unused solar', 'curtailed'], ['Generator', 'gen']];
    U.$('monthTable').innerHTML = U.table(
      [{ t: 'kWh' }].concat(D.MONTH_NAMES.map(function (n) { return { t: n, num: true }; }), [{ t: 'Year', num: true }]),
      rows.map(function (r) {
        return [r[0]].concat(M.map(function (x) { return Math.round(x[r[1]]); }), ['<b>' + Math.round(U.sum(M, function (x) { return x[r[1]]; })).toLocaleString() + '</b>']);
      })
    );
  }

  function renderYear(m) {
    var soc = Array.prototype.map.call(m.sim.hourly.soc, function (v) { return v * 100; });
    var low = soc.reduce(function (a, v) { return Math.min(a, v); }, 100);
    U.$('yearCaption').textContent = 'Each point is one hour. The lowest it gets is ' + Math.round(low) + '% (the floor is ' + m.d.minSocPct + '%)' +
      (m.T.gen > 0 ? '; the dips are where the generator steps in.' : '.');
    var ticks = [], acc = 0;
    D.DAYS_IN_MONTH.forEach(function (n, i) { ticks.push({ i: acc * 24, label: D.MONTH_NAMES[i] }); acc += n; });
    C.line(U.$('socChart'), {
      values: soc, max: 100, unit: '%', height: 160, color: COLORS.battery, area: true, xTicks: ticks,
      tip: function (i) {
        var day = Math.floor(i / 24), gen = m.sim.hourly.gen[i];
        return '<div class="tip-title">' + D.MONTH_NAMES[E.MONTH_OF_DAY[day]] + ' day ' + (day + 1) + ', ' + (i % 24) + ':00</div>' +
          'Battery <b>' + soc[i].toFixed(0) + '%</b><br>Sun ' + m.sim.psh[day].toFixed(2) + ' peak hours' +
          (gen > 0 ? '<br>Generator <b>' + gen.toFixed(1) + ' kWh</b>' : '');
      }
    });
  }

  function renderAutonomy(m) {
    var d = m.d;
    U.$('autonomyTable').innerHTML = U.table(
      [{ t: 'Season' }, { t: 'Home use per day', num: true }, { t: 'Solar per day', num: true }, { t: 'Days, average sun', num: true }, { t: 'Days, no sun', num: true }],
      m.autonomy.map(function (a) {
        var use = E.seasonalDailyLoad(a.season, d.springBaseKwh) + E.overheadKw(d, a.season) * 24;
        return [a.season.name, U.n1(use) + ' kWh', U.n1(d.pvKw * d.pvDerate * a.season.psh) + ' kWh',
          window.SunModel.days(a.solar), U.n1(a.dark.days)];
      }),
      { rowClass: function (i) { return m.autonomy[i].season.id === d.autonomySeason ? 'best' : ''; } }
    ) + '<p class="muted">"Average sun" is the challenge\'s ' + d.autonomyDays + '-day test (highlighted season). "No sun" is a stress case: snow on every panel.</p>';
  }
})();
