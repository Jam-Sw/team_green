/**
 * Suggestions tab — ui/tabs/suggestions.js
 * Tiered designs from the design search (ui/search.js), from the lowest
 * installed cost to the least generator use. Every tier meets all the
 * challenge requirements; "Use this tier" moves the System sliders to it.
 * Each tier's numbers come from the same local model the other tabs use.
 */
(function () {
  'use strict';

  var U = window.SunUI, Search = window.SunSearch;
  var app = null;
  var models = { key: null, byTier: {} };

  U.tab({
    id: 'suggestions',
    title: 'Suggestions',
    intro: function (m) {
      return 'Four acceptable projected designs, from the lowest upfront cost to the least generator use. Every tier meets all ' + m.checks.length +
        ' challenge requirements. <b>Use this tier</b> applies its panel and battery counts to System.';
    },
    html:
      U.card('How the local projection works',
        U.caption('This is a transparent calculation running in this browser, not an AI recommendation or a contractor quote.') +
        '<ol class="projection-flow" id="projectionFlow">' +
          '<li><b>1. Start with your settings</b><span>Home use, Victoria weather, backup target, component limits and costs.</span></li>' +
          '<li><b>2. Test every acceptable mix</b><span>Each panel × battery mix is sized, simulated hour by hour across 20 weather years, then costed over the selected period.</span></li>' +
          '<li><b>3. Keep four useful trade-offs</b><span>Lowest installed cost, lowest bad-year cost, lower generator use near the lowest average cost, and least generator use.</span></li>' +
        '</ol><p class="projection-note" id="projectionNote"></p>') +
      '<div id="tierProgress" class="card searching"><p class="muted">Simulating every design…</p>' +
        '<span class="progress"><span id="tierBar"></span></span></div>' +
      '<div class="tiers" id="tiers"></div>' +
      U.card('Everything, tier by tier', U.caption('The same numbers the other tabs show, for each tier. The shaded column is the design in use.') +
        '<div id="tierTable"></div>'),

    init: function (a) {
      app = a;
      // One listener for every "Use this tier" button.
      U.$('tiers').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-panels]');
        if (b) app.loadDesign(+b.dataset.panels, +b.dataset.batteries);
      });
    },

    render: function (m) {
      renderProjectionNote(m);
      Search.request(m.s, 'suggestions', {
        progress: function (f) { U.$('tierBar').style.width = (f * 100) + '%'; },
        done: function (r) { draw(r, app.model()); }
      });
      if (!Search.cached(m.s)) {
        U.$('tierProgress').hidden = false;
        U.$('tiers').innerHTML = '';
        U.$('tierTable').innerHTML = '';
      }
    }
  });

  /** State the inputs behind a projection so results are never mistaken for a quote. */
  function renderProjectionNote(m) {
    var s = m.s, weather = s.weatherMode === 'variable'
      ? Search.WEATHER_YEARS + ' day-to-day variable Victoria weather years'
      : 'seasonal-average Victoria weather';
    U.$('projectionNote').innerHTML = '<b>Projection basis:</b> ' + weather +
      ' · ' + s.autonomyDays + '-day ' + m.target.season.name.toLowerCase() +
      ' battery-only backup target · ' + s.horizonYears + '-year cost period. ' +
      'Installed costs are CAD, include the modelled GST/PST, and exclude rebates. Numbered dots under the System sliders show where these tiers sit. Equipment prices, site fit, shading, permits and final electrical design still need installer validation.';
  }

  /**
   * The full model of a tier's design, in the weather year the other tabs
   * show (the search itself covers every year). Cached per search and year.
   */
  function modelOf(r, t, current) {
    var k = r.key + '|' + current.s.weatherSeed;
    if (models.key !== k) models = { key: k, byTier: {} };
    if (!models.byTier[t.id]) {
      models.byTier[t.id] = window.SunModel.build(Object.assign({}, r.settings, {
        weatherSeed: current.s.weatherSeed,
        panels: t.row.panels, batteries: t.row.batteries, inverters: t.row.inverters
      }));
    }
    return models.byTier[t.id];
  }

  function draw(r, current) {
    U.$('tierProgress').hidden = true;
    if (!r.tiers.length) {
      U.$('tiers').innerHTML = '<p class="muted">No design within the site limit meets every requirement. ' +
        'Raise “Most panels the site fits” or lower the backup target in the settings.</p>';
      U.$('tierTable').innerHTML = '';
      return;
    }
    var inUse = Search.tierOf(r, current.d);
    var ms = r.tiers.map(function (t) { return modelOf(r, t, current); });
    U.$('tiers').innerHTML = r.tiers.map(function (t, i) { return card(t, ms[i], t === inUse, t.recommended); }).join('');
    U.$('tierTable').innerHTML = compare(r, ms, inUse);
  }

  function card(t, m, on, recommended) {
    var d = m.d;
    return '<article class="tier' + (on ? ' on' : '') + '" data-tier="' + t.n + '">' +
      '<div class="tier-head"><span class="tier-n">Tier ' + t.n + '</span>' + (recommended ? '<span class="pill good">Recommended</span>' : '') + '</div>' +
      '<h3>' + t.name + '</h3>' +
      '<p class="tier-rule">' + t.rule + (t.also.length ? ' Also: ' + t.also.map(function (a) { return a.charAt(0).toLowerCase() + a.slice(1); }).join(' ') : '') + '</p>' +
      '<p class="tier-price">' + U.money(m.cap.total) + '<span> installed</span></p>' +
      '<dl class="tier-facts">' +
        '<dt>' + d.horizonYears + '-year cost</dt><dd>' + U.money(m.life.lifecycle) + '</dd>' +
        (t.row.years > 1
          ? '<dt>Average of ' + t.row.years + ' years</dt><dd>' + U.money(t.row.lifecycle) + '</dd>' +
            '<dt>Worst of ' + t.row.years + ' years</dt><dd>' + U.money(t.row.worstLifecycle) + '</dd>'
          : '') +
        '<dt>Generator</dt><dd>' + U.kwh(m.T.gen) + '/yr</dd>' +
        '<dt>' + m.target.season.name + ' backup</dt><dd>' + window.SunModel.days(m.target.solar) + ' days</dd>' +
      '</dl>' +
      '<p class="tier-parts">' + d.panels + ' panels · ' + d.batteries + ' batteries · ' + d.inverters + ' inverters</p>' +
      (on ? '<p class="tier-inuse">✓ In use</p>'
          : '<button class="btn" type="button" data-panels="' + d.panels + '" data-batteries="' + d.batteries + '">Use this tier in System</button>') +
      '</article>';
  }

  /** Every number, one column per tier. */
  function compare(r, ms, inUse) {
    var tiers = r.tiers, d0 = ms[0].d, rows = [], classes = [];
    function section(name) { rows.push([name].concat(ms.map(function () { return ''; }))); classes.push('cat'); }
    function row(label, fn) { rows.push([label].concat(ms.map(fn))); classes.push(''); }

    section('System');
    row('Solar panels', function (m) { return m.d.panels + ' · ' + U.n1(m.d.pvKw) + ' kW'; });
    row('Batteries, usable storage', function (m) { return m.d.batteries + ' · ' + Math.round(m.d.usableKwh) + ' kWh'; });
    row('Inverters · GridBOSS', function (m) { return m.d.inverters + ' · ' + m.d.gridboss; });
    section('Cost');
    row('Installed cost', function (m) { return U.money(m.cap.total); });
    row('Running cost, year 1', function (m) { return U.money(m.life.annualOpex); });
    row(d0.horizonYears + '-year cost' + (r.years > 1 ? ', weather year ' + d0.weatherSeed : ''), function (m) { return U.money(m.life.lifecycle); });
    if (r.years > 1) {
      row(d0.horizonYears + '-year cost, average of ' + r.years + ' years', function (m, i) { return U.money(tiers[i].row.lifecycle); });
      row(d0.horizonYears + '-year cost, worst of ' + r.years + ' years', function (m, i) { return U.money(tiers[i].row.worstLifecycle); });
    }
    section('Energy, per year');
    row('Solar share of the home', function (m) { return U.pct(m.T.solarFraction); });
    row('Generator', function (m) { return U.kwh(m.T.gen); });
    row('Generator starts', function (m) { return m.T.genStarts; });
    row('Unused solar', function (m) { return U.kwh(m.T.curtailed); });
    section('Backup, battery only');
    row(ms[0].target.season.name + ', average sun', function (m) { return window.SunModel.days(m.target.solar) + ' days'; });
    row(ms[0].target.season.name + ', no sun', function (m) { return U.n1(m.target.dark.days) + ' days'; });
    section('Challenge');
    row('Requirements met', function (m) { return (m.checks.length - m.failed) + ' / ' + m.checks.length; });

    return U.table(
      [{ t: '' }].concat(tiers.map(function (t) { return { t: t.n + ' · ' + t.name, num: true, cls: t === inUse ? 'on' : '' }; })),
      rows, { rowClass: function (i) { return classes[i]; } }
    );
  }
})();
