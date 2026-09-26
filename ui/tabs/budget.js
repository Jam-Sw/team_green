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
      U.card('Installed cost', U.caption('The bridge from equipment to installed price is itemized below: balance of system, labour, soft costs, contingency and taxes.') +
        '<div id="budgetTable"></div>', '<button class="btn" id="csvBtn" type="button">Download CSV</button>') +
      U.card('Cash flow, replacements and running cost', U.caption('', 'lifeCaption') + '<div id="lifeChart" class="chart"></div><div id="lifeTable"></div>') +
      U.card('Compared with staying on BC Hydro', '<div id="gridCompare" class="prose"></div>'),

    init: function () {
      U.$('csvBtn').addEventListener('click', function () { downloadCsv(current.cap); });
    },

    render: function (m) {
      current = m;
      var cap = m.cap, life = m.life, d = m.d;
      var y10 = life.years[Math.min(9, life.years.length - 1)];
      U.$('budgetKpis').innerHTML =
        U.kpi('Installed cost', U.money(cap.total), U.money(cap.subtotal) + ' + ' + U.money(cap.pst + cap.gst) + ' tax') +
        U.kpi('Running cost, year 1', U.money(life.annualOpex), 'fuel, service, start wear and upkeep') +
        U.kpi('Cash paid by year 10', U.money(y10.cumulativeNominal), 'not discounted; includes installed cost') +
        U.kpi(d.horizonYears + '-year NPV', U.money(life.lifecycle), d.discountPct + '% discount rate; ' + d.escalationPct + '% annual escalation');
      renderInstalled(cap, d);
      renderRunning(life, d);
      renderGrid(d, life);
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
      '<p class="muted">Non-equipment installed cost: <b>' + U.money(cap.total - (cap.byCategory.Equipment || 0)) + '</b>. Expand the line items to audit every input.</p>' +
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
    var spikes = [], genRepl = [];
    life.years.forEach(function (y) {
      if (y.inverters > 0) spikes.push('the inverter replacement (year ' + y.year + ')');
      if (y.batteries > 0) spikes.push('the battery replacement (year ' + y.year + ')');
      if (y.genReplacements) genRepl.push('year ' + y.year + ' (' + U.money(y.generatorReplacementCost) + ')');
    });
    // Each service costs the generator 2% efficiency, so at ~10 services a
    // year it reaches the replacement point every year or two. Say so, or the
    // alternating bar heights look like a bug.
    var gens = U.sum(life.years, function (y) { return y.genReplacements; });
    var genNote = gens ? ' Generator replacements: ' + genRepl.join(', ') + '. Each starts at ' + U.money(d.genReplaceCost) +
      ', and is replaced after efficiency falls to ' + U.pct(d.genReplaceAtEff) + '.' : '';
    U.$('lifeCaption').textContent = 'Each bar is cash paid in that year\'s prices. Fuel, carbon add-on, service, start wear and upkeep rise ' +
      d.escalationPct + '% a year; the NPV table discounts each year at ' + d.discountPct + '%.' +
      (spikes.length ? ' The tall bars are ' + spikes.join(' and ') + '.' : '') + genNote;
    C.stackedBars(U.$('lifeChart'), {
      labels: life.years.map(function (y) { return String(y.year); }), unit: '$', height: 220,
      series: [
        { name: 'Generator (fuel, service, starts)', color: U.COLORS.gen, values: life.years.map(function (y) { return y.generator; }) },
        { name: 'Upkeep', color: U.COLORS.aqua, values: life.years.map(function (y) { return y.om; }) },
        { name: 'Inverter / battery replacement', color: U.COLORS.battery, values: life.years.map(function (y) { return y.inverters + y.batteries; }) }
      ],
      tipTitle: function (i) { return 'Year ' + life.years[i].year + ' · ' + U.money(life.years[i].total); }
    });
    var y10 = life.years[Math.min(9, life.years.length - 1)], last = life.years[life.years.length - 1];
    var replacementRows = [
      ['Inverter replacement', 'Year ' + d.inverterReplaceYear, U.money(life.inverterReplacementBase) + ' at today\'s prices'],
      ['Battery replacement', 'Year ' + d.batteryReplaceYear, U.money(life.batteryReplacementBase) + ' at today\'s prices'],
      ['Generator replacement', gens ? genRepl.join('; ') : 'Not reached in this projection', U.money(d.genReplaceCost) + ' base price each']
    ];
    var annual = life.years.map(function (y) {
      return [y.year, U.kwh(y.genKwh), y.genServices, y.genReplacements, U.money(y.generatorStartWear),
        U.money(y.inverters + y.batteries), U.money(y.total), U.money(y.cumulativeNominal), U.money(y.cumulativeNpv)];
    });
    U.$('lifeTable').innerHTML =
      U.table([{ t: 'Accounting' }, { t: 'Value', num: true }], [
        ['Discount rate used for NPV', d.discountPct + '% / year'],
        ['Escalation for fuel, carbon, service, start wear and upkeep', d.escalationPct + '% / year'],
        ['10-year cash outlay (not discounted)', U.money(y10.cumulativeNominal)],
        ['10-year NPV', U.money(y10.cumulativeNpv)],
        ['25-year cash outlay (not discounted)', U.money(last.cumulativeNominal)],
        ['<b>25-year NPV</b>', '<b>' + U.money(life.lifecycle) + '</b>']
      ]) +
      '<h4>Replacement schedule</h4>' + U.table([{ t: 'Asset' }, { t: 'When' }, { t: 'Price basis', num: true }], replacementRows) +
      '<details class="more-inline"><summary>Show annual cash-flow schedule</summary>' +
      U.table([{ t: 'Year', num: true }, { t: 'Generator', num: true }, { t: 'Services', num: true }, { t: 'Gen. replacements', num: true },
        { t: 'Start wear', num: true }, { t: 'Inverter / battery', num: true }, { t: 'Annual cash', num: true },
        { t: 'Cumulative cash', num: true }, { t: 'Cumulative NPV', num: true }], annual) + '</details>';
  }

  function renderGrid(d, life) {
    var homeKwh = U.sum(D.SEASONS, function (se) { return E.seasonalDailyLoad(se, d.springBaseKwh) * 365 / 4; });
    var bill = B.bcHydroAnnual(homeKwh), npv = 0, nominal = 0;
    for (var y = 1; y <= d.horizonYears; y++) {
      var cash = bill * Math.pow(1 + d.escalationPct / 100, y - 1);
      nominal += cash;
      npv += cash / Math.pow(1 + d.discountPct / 100, y);
    }
    U.$('gridCompare').innerHTML =
      '<p>The same home (' + U.kwh(homeKwh) + ' a year) on BC Hydro would cost about <b>' + U.money(bill) + ' in year 1</b>, <b>' + U.money(nominal) + ' in cash</b> over ' + d.horizonYears + ' years, or <b>' + U.money(npv) + ' NPV</b> at the same ' + d.discountPct + '% discount rate.</p>' +
      '<p>This off-grid design is <b>' + U.money(life.years[life.years.length - 1].cumulativeNominal) + ' in cash</b> or <b>' + U.money(life.lifecycle) + ' NPV</b>. BC Hydro is cheaper; the value proposition here is full independence and whole-home backup, not bill savings.</p>';
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
