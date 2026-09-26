/**
 * Budget tab — ui/tabs/budget.js
 * Line-item installed cost for Victoria, BC (permits, PST/GST, labour), the
 * operating cost over the system's life, and the BC Hydro comparison.
 */
(function () {
  'use strict';

  var U = window.SunUI, C = window.SunCharts, D = window.SunData, E = window.SunEngine, B = window.SunBudget;
  var CATEGORIES = ['Equipment', 'Balance of system', 'Labour', 'Soft costs', 'Contingency'];
  var current = null;

  U.tab({
    id: 'budget',
    title: 'Budget',
    intro: 'What it costs to install in Victoria, BC, and to run over its life.',
    html:
      '<div class="kpis" id="budgetKpis"></div>' +
      U.card('Installed cost, line by line', '<div id="budgetTable"></div>', '<button class="btn" id="csvBtn" type="button">Download CSV</button>') +
      U.card('Operating cost by year', '<div id="lifeChart" class="chart"></div><div id="lifeTable"></div>') +
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
      renderLines(cap);
      renderLifecycle(life, d);
      renderGrid(d);
    }
  });

  function renderLines(cap) {
    var rows = [], classes = [];
    function add(cls, cells) { classes.push(cls); rows.push(cells); }
    CATEGORIES.forEach(function (c) {
      var lines = cap.lines.filter(function (l) { return l.category === c; });
      if (!lines.length) return;
      add('cat', [c, '', '', '', U.money(cap.byCategory[c])]);
      lines.forEach(function (l) {
        add('', [U.esc(l.item) + '<span class="note block">' + U.esc(l.note) + '</span>', l.qty % 1 ? l.qty.toFixed(1) : l.qty,
          l.unit, U.money(l.unitCost), U.money(l.total) + (l.pst ? '' : ' <span class="note" title="PST exempt">†</span>')]);
      });
    });
    add('sub', ['Before tax', '', '', '', U.money(cap.subtotal)]);
    add('', ['PST 7% on ' + U.money(cap.pstBase) + ' of taxable goods', '', '', '', U.money(cap.pst)]);
    add('', ['GST 5% (permit fees excluded)', '', '', '', U.money(cap.gst)]);
    add('total', ['Total installed cost', '', '', '', U.money(cap.total)]);
    U.$('budgetTable').innerHTML = U.table(
      [{ t: 'Item' }, { t: 'Qty', num: true }, { t: 'Unit' }, { t: 'Unit cost', num: true }, { t: 'Total', num: true }],
      rows, { rowClass: function (i) { return classes[i]; } }
    ) + '<p class="muted">† PST exempt (PV panels, inverters, controllers, PV wiring — PST Bulletin 203). No BC Hydro rebate: those require a grid-tied, net-metered system.</p>';
  }

  function renderLifecycle(life, d) {
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
      ['Running costs in today\'s dollars (' + d.discountPct + '% discount, ' + d.escalationPct + '%/yr inflation)', U.money(life.npvOpex)],
      ['<b>Total over ' + d.horizonYears + ' years</b>', '<b>' + U.money(life.lifecycle) + '</b>']
    ]);
  }

  function renderGrid(d) {
    var homeKwh = U.sum(D.SEASONS, function (se) { return E.seasonalDailyLoad(se, d.springBaseKwh) * 365 / 4; });
    var bill = B.bcHydroAnnual(homeKwh), npv = 0;
    for (var y = 1; y <= d.horizonYears; y++) npv += bill * Math.pow(1 + d.escalationPct / 100, y - 1) / Math.pow(1 + d.discountPct / 100, y);
    U.$('gridCompare').innerHTML =
      '<p>The same home (' + U.kwh(homeKwh) + '/yr) on BC Hydro would cost about <b>' + U.money(bill) + '/yr</b>, or <b>' + U.money(npv) + '</b> over ' + d.horizonYears + ' years.</p>' +
      '<p>Grid power here is cheap and ~98% clean, so this system is not about saving on bills. The brief asks for full independence and whole-home backup; the question that matters is which off-grid design is cheapest over its life (Optimizer tab).</p>';
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
