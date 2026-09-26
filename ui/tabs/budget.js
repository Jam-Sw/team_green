/**
 * Budget tab — ui/tabs/budget.js
 * What the system costs to install in Victoria, BC (summary first, every line
 * item on request), what it costs to run, and the BC Hydro comparison.
 */
(function () {
  'use strict';

  var U = window.SunUI, C = window.SunCharts, D = window.SunData, E = window.SunEngine, B = window.SunBudget;
  var CATEGORIES = [
    ['Equipment', 'panels, inverters, GridBOSS, batteries, service gear'],
    ['Balance of system', 'wiring, rapid shutdown, mounts, trenching'],
    ['Labour', 'installers and electricians at Victoria rates'],
    ['Soft costs', 'design, engineering, permits, freight'],
    ['Contingency', 'allowance for the unexpected']
  ];
  var current = null;

  U.tab({
    id: 'budget',
    title: 'Budget',
    intro: 'What the system costs to install in Victoria, BC, and to run over its life.',
    html:
      '<div class="kpis" id="budgetKpis"></div>' +
      U.card('Installed cost', U.caption('Equipment at the challenge\'s prices, Victoria labour rates and permit fees, and BC taxes.') +
        '<div id="budgetTable"></div>', '<button class="btn" id="csvBtn" type="button">Download CSV</button>') +
      U.card('Running cost by year', U.caption('', 'lifeCaption') + '<div id="lifeChart" class="chart"></div><div id="lifeTable"></div>') +
      U.card('Compared with staying on BC Hydro', '<div id="gridCompare" class="prose"></div>'),

    init: function () {
      U.$('csvBtn').addEventListener('click', function () { downloadCsv(current.cap); });
    },

    render: function (m) {
      current = m;
      var cap = m.cap, life = m.life, d = m.d;
      U.$('budgetKpis').innerHTML =
        U.kpi('Installed cost', U.money(cap.total), U.money(cap.subtotal) + ' + ' + U.money(cap.pst + cap.gst) + ' tax') +
        U.kpi('Running cost, year 1', U.money(life.annualOpex), 'generator, upkeep, standby utility') +
        U.kpi(d.horizonYears + '-year cost', U.money(life.lifecycle), 'installed + running, in today\'s dollars');
      renderInstalled(cap, d);
      renderRunning(life, d);
      renderGrid(d);
    }
  });

  function renderInstalled(cap, d) {
    var summary = CATEGORIES.map(function (c) {
      var note = c[0] === 'Contingency' ? d.contingencyPct + '% of the pre-tax total' : c[1];
      return [c[0] + '<span class="note block">' + note + '</span>', U.money(cap.byCategory[c[0]] || 0)];
    });
    summary.push(['Taxes<span class="note block">PST 7% on ' + U.money(cap.pstBase) + ' of taxable goods · GST 5% on all but permits</span>', U.money(cap.pst + cap.gst)]);
    summary.push(['Total installed cost', U.money(cap.total)]);

    U.$('budgetTable').innerHTML =
      U.table([{ t: '' }, { t: 'Cost', num: true }], summary, { rowClass: function (i) { return i === summary.length - 1 ? 'total' : ''; } }) +
      '<details class="more-inline"><summary>Show all ' + cap.lines.length + ' line items</summary>' + lineItems(cap) + '</details>';
  }

  function lineItems(cap) {
    var rows = [], classes = [];
    CATEGORIES.forEach(function (c) {
      var lines = cap.lines.filter(function (l) { return l.category === c[0]; });
      if (!lines.length) return;
      classes.push('cat'); rows.push([c[0], '', '', '', U.money(cap.byCategory[c[0]])]);
      lines.forEach(function (l) {
        classes.push('');
        rows.push([U.esc(l.item) + '<span class="note block">' + U.esc(l.note) + '</span>', l.qty % 1 ? l.qty.toFixed(1) : l.qty,
          l.unit, U.money(l.unitCost), U.money(l.total) + (l.pst ? '' : ' <span class="note" title="PST exempt">†</span>')]);
      });
    });
    return U.table(
      [{ t: 'Item' }, { t: 'Qty', num: true }, { t: 'Unit' }, { t: 'Unit cost', num: true }, { t: 'Total', num: true }],
      rows, { rowClass: function (i) { return classes[i]; } }
    ) + '<p class="muted">† No PST: panels, inverters, controllers and PV wiring are exempt under PST Bulletin 203. No BC Hydro rebate applies: rebates need a grid-tied, net-metered system.</p>';
  }

  function renderRunning(life, d) {
    var spikes = [];
    life.years.forEach(function (y) {
      if (y.inverters > 0) spikes.push('the inverter replacement (year ' + y.year + ')');
      if (y.batteries > 0) spikes.push('the battery replacement (year ' + y.year + ')');
    });
    // Each service costs the generator 2% efficiency, so at ~10 services a
    // year it reaches the replacement point every year or two. Say so, or the
    // alternating bar heights look like a bug.
    var gens = U.sum(life.years, function (y) { return y.genReplacements; });
    var genNote = gens ? ' Bars that step up every year or two include a replacement generator (' + U.money(d.genReplaceCost) +
      '): each 100 kWh service costs it 2% efficiency, and it is replaced at ' + U.pct(d.genReplaceAtEff) + ', ' + gens + ' times over ' + d.horizonYears + ' years.' : '';
    U.$('lifeCaption').textContent = 'Each bar is one year. Most of it is generator fuel and service' +
      (spikes.length ? '; the tall bars are ' + spikes.join(' and ') + '.' : '.') + genNote;
    C.stackedBars(U.$('lifeChart'), {
      labels: life.years.map(function (y) { return String(y.year); }), unit: '$', height: 220,
      series: [
        { name: 'Generator', color: U.COLORS.gen, values: life.years.map(function (y) { return y.generator; }) },
        { name: 'Upkeep + standby utility', color: U.COLORS.aqua, values: life.years.map(function (y) { return y.om + y.utility; }) },
        { name: 'Inverter / battery replacement', color: U.COLORS.battery, values: life.years.map(function (y) { return y.inverters + y.batteries; }) }
      ],
      tipTitle: function (i) { return 'Year ' + life.years[i].year + ' · ' + U.money(life.years[i].total); }
    });
    U.$('lifeTable').innerHTML = U.table([{ t: '' }, { t: '', num: true }], [
      ['Installed cost', U.money(life.capex)],
      ['Running costs in today\'s dollars (' + d.discountPct + '% discount rate, ' + d.escalationPct + '% a year inflation)', U.money(life.npvOpex)],
      ['<b>' + d.horizonYears + '-year cost</b>', '<b>' + U.money(life.lifecycle) + '</b>']
    ]);
  }

  function renderGrid(d) {
    var homeKwh = U.sum(D.SEASONS, function (se) { return E.seasonalDailyLoad(se, d.springBaseKwh) * 365 / 4; });
    var bill = B.bcHydroAnnual(homeKwh), npv = 0;
    for (var y = 1; y <= d.horizonYears; y++) npv += bill * Math.pow(1 + d.escalationPct / 100, y - 1) / Math.pow(1 + d.discountPct / 100, y);
    U.$('gridCompare').innerHTML =
      '<p>The same home (' + U.kwh(homeKwh) + ' a year) on BC Hydro would cost about <b>' + U.money(bill) + ' a year</b>, or <b>' + U.money(npv) + '</b> over ' + d.horizonYears + ' years.</p>' +
      '<p>Grid power here is cheap and about 98% clean, so this system does not pay for itself in bill savings. The brief asks for full independence and whole-home backup. The question that matters is which off-grid design is cheapest over its life, which the Optimizer tab answers.</p>';
  }

  function downloadCsv(cap) {
    var rows = [['Category', 'Item', 'Qty', 'Unit', 'Unit cost', 'Total', 'PST taxable', 'Note']];
    cap.lines.forEach(function (l) { rows.push([l.category, l.item, l.qty, l.unit, l.unitCost.toFixed(2), l.total.toFixed(2), l.pst ? 'yes' : 'no', l.note]); });
    rows.push(['Tax', 'PST 7%', '', '', '', cap.pst.toFixed(2), '', '']);
    rows.push(['Tax', 'GST 5%', '', '', '', cap.gst.toFixed(2), '', '']);
    rows.push(['Total', 'Total installed cost', '', '', '', cap.total.toFixed(2), '', '']);
    var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'victoria-offgrid-budget.csv';
    a.click();
  }
})();
