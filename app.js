/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage App Controller — app.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Builds the control panel from SunSettings.SCHEMA, recomputes the design,
 * simulation and budget on every change, and renders each tab.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  var D = window.SunData, E = window.SunEngine, B = window.SunBudget;
  var S = window.SunSettings, C = window.SunCharts;
  var EQ = D.EQUIPMENT;

  var COLORS = {
    solar: 'var(--c-solar)', battery: 'var(--c-battery)', gen: 'var(--c-gen)',
    aqua: 'var(--c-aqua)', load: 'var(--c-load)'
  };

  var state = {
    s: S.load(),
    season: 'winter',
    tab: 'overview',
    opt: null
  };

  // ═══════════════════════════════════════════════════════════════════════
  // FORMATTING
  // ═══════════════════════════════════════════════════════════════════════
  function $(id) { return document.getElementById(id); }
  function money(v) { return '$' + Math.round(v).toLocaleString(); }
  function kwh(v) { return Math.round(v).toLocaleString() + ' kWh'; }
  function pct(v) { return (v * 100).toFixed(0) + '%'; }
  function n1(v) { return v.toFixed(1); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ═══════════════════════════════════════════════════════════════════════
  // CONTROLS
  // ═══════════════════════════════════════════════════════════════════════
  function renderControls() {
    var panel = $('controlPanel');
    panel.innerHTML = '';
    S.GROUPS.forEach(function (g, gi) {
      var det = document.createElement('details');
      det.className = 'ctl-group';
      det.open = gi < 3;
      det.innerHTML = '<summary>' + g.title + '</summary><div class="group-hint">' + g.hint + '</div>';
      S.SCHEMA.filter(function (f) { return f.group === g.id; }).forEach(function (f) {
        det.appendChild(control(f));
      });
      panel.appendChild(det);
    });
  }

  function control(f) {
    var wrap = document.createElement('div');
    wrap.className = 'ctl';
    var v = state.s[f.key];
    if (f.type === 'range') {
      wrap.innerHTML =
        '<label class="ctl-label" for="ctl-' + f.key + '"><span>' + f.label + '</span>' +
        '<span class="ctl-value" id="val-' + f.key + '"></span></label>' +
        '<input type="range" id="ctl-' + f.key + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + v + '">' +
        (f.hint ? '<div class="ctl-hint">' + f.hint + '</div>' : '');
      var input = wrap.querySelector('input');
      input.addEventListener('input', function () { set(f.key, input.value); });
    } else if (f.type === 'choice') {
      wrap.innerHTML = '<div class="ctl-label"><span>' + f.label + '</span></div><div class="seg"></div>';
      var seg = wrap.querySelector('.seg');
      f.options.forEach(function (o) {
        var b = document.createElement('button');
        b.textContent = o.t;
        b.dataset.v = o.v;
        if (String(o.v) === String(v)) b.className = 'active';
        b.addEventListener('click', function () {
          seg.querySelectorAll('button').forEach(function (x) { x.className = ''; });
          b.className = 'active';
          set(f.key, o.v);
        });
        seg.appendChild(b);
      });
    } else if (f.type === 'bool') {
      wrap.innerHTML = '<label class="switch"><input type="checkbox"' + (v ? ' checked' : '') + '> ' + f.label + '</label>';
      var cb = wrap.querySelector('input');
      cb.addEventListener('change', function () { set(f.key, cb.checked); });
    }
    return wrap;
  }

  function refreshControlValues() {
    S.SCHEMA.forEach(function (f) {
      var out = $('val-' + f.key);
      if (!out) return;
      var v = state.s[f.key];
      var txt = (f.step < 1 ? Number(v).toFixed(f.step < 0.1 ? 2 : 1) : v) + (f.unit ? ' ' + f.unit : '');
      out.classList.remove('adjusted');
      // Show when the datasheet minimums raised a design count.
      var actual = { panels: null, batteries: state.d.batteries, inverters: state.d.inverters }[f.key];
      if (actual != null && actual !== v) {
        txt = v + ' → ' + actual;
        out.classList.add('adjusted');
        out.title = 'Raised to the datasheet / service minimum';
      }
      out.textContent = txt;
    });
  }

  var timer = null;
  function set(key, value) {
    state.s[key] = S.sanitize(key, value);
    S.save(state.s);
    clearTimeout(timer);
    timer = setTimeout(recompute, 120);
  }

  function applyDesign(panels, batteries) {
    state.s.panels = panels;
    state.s.batteries = batteries;
    state.s.inverters = 1;
    S.save(state.s);
    renderControls();
    recompute();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODEL
  // ═══════════════════════════════════════════════════════════════════════
  function recompute() {
    var s = state.s;
    var d = E.buildDesign(s);
    state.d = d;
    state.sim = E.simulateSteadyYear(d, { keepHourly: true });
    state.aut = D.SEASONS.map(function (se) {
      return {
        season: se,
        solar: E.autonomy(d, se.id, 14, true),
        dark: E.autonomy(d, se.id, 14, false)
      };
    });
    state.cap = B.capex(d);
    state.lifeKwh = E.lifecycleEnergy(d);
    state.life = B.lifecycle(d, state.lifeKwh, state.cap);
    refreshControlValues();
    render();
  }

  function checks() {
    var d = state.d, T = state.sim.totals, sd = d.minimums.stringDesign;
    var target = state.aut.filter(function (a) { return a.season.id === d.autonomySeason; })[0];
    var I = EQ.inverter;
    var list = [
      { fr: 'FR-1', ok: true, text: 'Component counts determined',
        detail: d.panels + ' panels · ' + d.inverters + ' FlexBOSS21 · ' + d.gridboss + ' GridBOSS · ' + d.batteries + ' batteries' },
      { fr: 'FR-2', ok: target.solar.days >= d.autonomyDays,
        text: d.autonomyDays + '-day whole-home backup in ' + target.season.name.toLowerCase() + ' without the generator',
        detail: (target.solar.capped ? '≥ 14' : n1(target.solar.days)) + ' days at average ' + target.season.name.toLowerCase() + ' sun from a full battery' },
      { fr: 'FR-5', ok: T.unserved < 0.01, text: 'Every hour of the year served (solar + battery + generator)',
        detail: T.unserved < 0.01 ? 'No unserved energy' : kwh(T.unserved) + ' unserved' },
      { fr: 'FR-6', ok: sd.ok && d.layout.ok, text: 'Strings within FlexBOSS21 MPPT limits',
        detail: 'Longest string Voc at ' + d.designLowC + ' °C: ' + n1(Math.max.apply(null, d.layout.strings) * sd.vocColdV) + ' V (< ' + I.mpptHighProtectV + ' V)' },
      { fr: 'FR-7', ok: d.inverters * I.batteryOnlyKw >= d.designPeakKw,
        text: 'Inverters carry the design peak on battery alone',
        detail: d.inverters + ' × ' + I.batteryOnlyKw + ' kW = ' + d.inverters * I.batteryOnlyKw + ' kW ≥ ' + d.designPeakKw + ' kW' },
      { fr: 'FR-7', ok: d.batteries * EQ.battery.capacityAh >= d.inverters * I.minBatteryAhPerInverter,
        text: 'Battery bank ≥ 600 Ah per inverter (EG4)',
        detail: d.batteries * EQ.battery.capacityAh + ' Ah for ' + d.inverters + ' inverter(s)' },
      { fr: 'FR-7', ok: d.pvKw <= d.inverters * I.maxPvKw, text: 'PV ≤ 21 kW per inverter',
        detail: n1(d.pvKw) + ' kW on ' + d.inverters + ' inverter(s)' },
      { fr: 'FR-7', ok: d.gridboss * EQ.gridboss.ratedA >= d.serviceA && d.inverters <= d.gridboss * EQ.gridboss.maxInverters,
        text: d.serviceA + ' A service covered by GridBOSS units',
        detail: d.gridboss + ' × 200 A GridBOSS, ≤ 3 inverters each' },
      { fr: 'FR-8', ok: true, text: 'Existing 6 kW generator integrated',
        detail: 'GridBOSS GEN port (125 A) ≥ 25 A generator output; 2-wire auto-start' },
      { fr: 'FR-9', ok: true, text: 'Zero export to BC Hydro', detail: 'Surplus PV is curtailed: ' + kwh(T.curtailed) + '/yr' },
      { fr: 'FR-10', ok: true, text: 'Generator use minimised',
        detail: kwh(T.gen) + '/yr, ' + T.genStarts + ' starts, ' + money(T.genCost) + ' in year 1 (' + (d.genStrategy === 'smart' ? 'forecast-aware' : 'SOC trigger') + ')' }
    ];
    return list;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  function render() {
    renderStatus();
    renderOverview();
    if (state.tab === 'energy') renderEnergy();
    if (state.tab === 'generator') {
      renderGenerator();
      if (!state.compared) { state.compared = true; runComparison(); }
    }
    if (state.tab === 'optimizer') {
      if (!state.opt && !state.optRunning) runOptimizer();
      else renderOptimizer();
    }
    if (state.tab === 'budget') renderBudget();
    if (state.tab === 'assumptions') renderAssumptions();
  }

  function renderStatus() {
    var all = checks();
    var failed = all.filter(function (c) { return !c.ok; }).length;
    var badge = $('statusBadge');
    badge.className = 'status-badge ' + (failed ? 'fail' : 'ok');
    $('statusText').textContent = failed ? failed + ' requirement' + (failed > 1 ? 's' : '') + ' failing' : 'All requirements met';
  }

  function kpi(label, value, sub) {
    return '<div class="kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + value + '</div>' +
           (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + '</div>';
  }

  function renderOverview() {
    var d = state.d, T = state.sim.totals, cap = state.cap, life = state.life;
    var target = state.aut.filter(function (a) { return a.season.id === d.autonomySeason; })[0];
    $('kpis').innerHTML =
      kpi('Installed cost (incl. tax)', money(cap.total), '$' + (cap.total / (d.pvKw * 1000)).toFixed(2) + '/W · ' + money(cap.equipment) + ' equipment') +
      kpi('Array / storage', n1(d.pvKw) + ' kW · ' + Math.round(d.usableKwh) + ' kWh', d.panels + ' panels · ' + d.batteries + ' × 14.3 kWh (usable to ' + d.minSocPct + '%)') +
      kpi('Generator, year 1', kwh(T.gen), money(T.genCost) + ' · ' + T.genStarts + ' starts · ' + T.genHours + ' h') +
      kpi('Solar share of load', pct(T.solarFraction), kwh(T.load) + ' annual load') +
      kpi(target.season.name + ' backup, no generator', (target.solar.capped ? '14+' : n1(target.solar.days)) + ' days', 'target ' + d.autonomyDays + ' days · ' + n1(target.dark.days) + ' days with zero sun') +
      kpi(d.horizonYears + '-yr lifecycle cost', money(life.lifecycle), 'capex + NPV of operating costs @ ' + d.discountPct + '%');

    var rows = [
      ['JA Solar JAM54D41-440/LB', d.panels, d.layout.count + ' strings of ' + uniq(d.layout.strings) + ' · ' + n1(d.pvKw) + ' kWp'],
      ['EG4 FlexBOSS21', d.inverters, why(d.minimums, 'inv')],
      ['EG4 GridBOSS', d.gridboss, d.serviceA + ' A service ÷ 200 A per GridBOSS; ≤ 3 inverters each'],
      ['EG4 280Ah All-Weather', d.batteries, n1(d.batteryKwh) + ' kWh nominal · ' + why(d.minimums, 'bat')],
      ['400 A fused disconnect', 1, 'Service entrance, kept as utility standby'],
      ['Distribution splitter', 1, 'Feeds each GridBOSS / 200 A leg'],
      ['200 A panel', Math.ceil(d.serviceA / 200), 'One per GridBOSS load output'],
      ['BE7500ID generator (existing)', 1, 'Re-connected to GridBOSS GEN port']
    ];
    $('designSummary').innerHTML = '<table><thead><tr><th>Component</th><th class="num">Qty</th><th>Basis</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td><td class="note">' + r[2] + '</td></tr>'; }).join('') +
      '</tbody></table>';

    $('checklist').innerHTML = checks().map(function (c) {
      return '<li class="' + (c.ok ? 'pass' : 'fail') + '"><span class="icon">' + (c.ok ? '✓' : '✗') + '</span><span>' +
        '<span class="fr">' + c.fr + '</span>' + c.text + '<span class="detail">' + c.detail + '</span></span></li>';
    }).join('');

    renderStrings();
    renderSld();
  }

  function uniq(a) {
    return a.filter(function (v, i) { return a.indexOf(v) === i; }).join('/');
  }

  function why(m, kind) {
    if (kind === 'inv') {
      var r = [];
      r.push('peak ' + state.d.designPeakKw + ' kW needs ' + m.invForLoad);
      r.push('PV needs ' + m.invForPv);
      r.push('service needs ' + m.gbForService);
      return 'min of: ' + r.join(', ');
    }
    return 'min ' + m.batteries + ' (' + m.batForAh + ' for 600 Ah/inverter, ' + m.batForPower + ' for peak discharge)';
  }

  function renderStrings() {
    var sd = state.d.minimums.stringDesign, d = state.d, P = EQ.panel, I = EQ.inverter;
    $('strings').innerHTML =
      '<table><tbody>' +
      '<tr><td>Voc,max = Voc × (1 + (T<sub>min</sub> − 25) × (−0.250)/100)</td><td class="num">' + P.vocV + ' × (1 + (' + d.designLowC + ' − 25) × −0.0025) = <b>' + sd.vocColdV.toFixed(2) + ' V</b></td></tr>' +
      '<tr><td>Max modules per string (MPPT high-voltage protection ' + I.mpptHighProtectV + ' V)</td><td class="num">⌊' + I.mpptHighProtectV + ' / ' + sd.vocColdV.toFixed(2) + '⌋ = <b>' + sd.maxSeries + '</b></td></tr>' +
      '<tr><td>Min modules per string (hot Vmp ' + sd.vmpHotV.toFixed(1) + ' V at ' + d.designHotCellC + ' °C ≥ ' + I.mpptFullPowerV[0] + ' V)</td><td class="num"><b>' + sd.minSeries + '</b></td></tr>' +
      '<tr><td>Strings in this design</td><td class="num">' + d.layout.count + ' strings (' + uniq(d.layout.strings) + ' modules), ' + d.layout.perInverter + ' per inverter of ' + sd.stringsPerInverter + ' inputs</td></tr>' +
      '<tr><td>Cold string Voc / hot string Vmp</td><td class="num">' + n1(Math.max.apply(null, d.layout.strings) * sd.vocColdV) + ' V / ' + n1(Math.min.apply(null, d.layout.strings) * sd.vmpHotV) + ' V</td></tr>' +
      '<tr><td>Strings per MPPT (Isc ' + P.iscA + ' A vs MPPT rating 31/31/19 A)</td><td class="num">' + sd.stringsPerMppt.join(' / ') + '</td></tr>' +
      '</tbody></table>';
  }

  // ── Single-line diagram ─────────────────────────────────────────────────
  function renderSld() {
    var d = state.d;
    var W = 1000, gb = d.gridboss;
    var colW = (W - 360) / gb;
    var H = 460;
    var svg = [];
    function box(x, y, w, h, title, sub, cls) {
      svg.push('<rect class="box ' + (cls || '') + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>');
      svg.push('<text x="' + (x + w / 2) + '" y="' + (y + (sub ? h / 2 - 3 : h / 2 + 4)) + '" text-anchor="middle">' + title + '</text>');
      if (sub) svg.push('<text class="small" x="' + (x + w / 2) + '" y="' + (y + h / 2 + 12) + '" text-anchor="middle">' + sub + '</text>');
    }
    function wire(pts, cls) {
      svg.push('<polyline class="wire ' + (cls || '') + '" points="' + pts.map(function (p) { return p.join(','); }).join(' ') + '"/>');
    }
    // Utility chain (left column)
    box(20, 20, 130, 44, 'BC Hydro meter', 'standby, zero export', 'existing');
    box(20, 100, 130, 44, '400 A fused disc.', '$1,500', 'new');
    box(20, 180, 130, 44, 'Distribution splitter', '$4,500', 'new');
    wire([[85, 64], [85, 100]]);
    wire([[85, 144], [85, 180]]);
    // Generator
    box(20, 300, 130, 44, 'BE7500ID 6 kW', 'existing · 2-wire start', 'existing');

    var invLeft = d.inverters, batPer = Math.floor(d.batteries / d.inverters), batExtra = d.batteries % d.inverters;
    var invIdx = 0;
    for (var g = 0; g < gb; g++) {
      var cx = 200 + colW * g;
      var bw = Math.min(200, colW - 30);
      var nInv = Math.ceil(invLeft / (gb - g));
      invLeft -= nInv;
      box(cx, 180, bw, 44, 'GridBOSS #' + (g + 1), '200 A · GEN / hybrid ports', 'new');
      box(cx, 20, bw, 44, '200 A panel ' + String.fromCharCode(65 + g), 'house loads', 'new');
      wire([[150, 202], [cx, 202]]);
      wire([[cx + bw / 2, 180], [cx + bw / 2, 64]]);
      if (g === 0) wire([[150, 322], [175, 322], [175, 214], [cx, 214]], 'gen');
      var ix = cx;
      var iw = Math.max(60, (bw - (nInv - 1) * 8) / nInv);
      for (var k = 0; k < nInv; k++) {
        var x = ix + k * (iw + 8);
        var bats = batPer + (invIdx < batExtra ? 1 : 0);
        var strs = Math.ceil(d.layout.count / d.inverters);
        box(x, 270, iw, 44, 'FlexBOSS21', '#' + (invIdx + 1), 'new');
        wire([[x + iw / 2, 270], [x + iw / 2, 224]]);
        box(x, 360, iw, 44, bats + ' × 280Ah', n1(bats * EQ.battery.energyKwh) + ' kWh', 'new');
        wire([[x + iw / 2, 314], [x + iw / 2, 360]], 'bat');
        svg.push('<text class="small" x="' + (x + iw + 2) + '" y="298" fill="var(--c-solar)">☀ ' + strs + ' str</text>');
        invIdx++;
      }
    }
    // Common 48 V battery bus: the paralleled inverters share one bank.
    if (d.inverters > 1) wire([[200 + 20, 404 + 10], [200 + colW * (gb - 1) + Math.min(200, colW - 30) - 20, 404 + 10]], 'bat');
    svg.push('<text class="small" x="20" y="' + (H - 18) + '">Gold = new equipment · dashed = existing · blue = common 48 V battery bus (paralleled inverters share one bank) · orange = generator feed.</text>');
    svg.push('<text class="small" x="20" y="' + (H - 4) + '">Existing emergency-loads panel is re-fed from panel A; the manual transfer switch is retired (GridBOSS handles source transfer).</text>');
    $('sld').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Single-line diagram">' + svg.join('') + '</svg>';
  }

  // ── Energy tab ──────────────────────────────────────────────────────────
  function seasonAverageDay(seasonId) {
    var H = state.sim.hourly;
    var keys = ['load', 'direct', 'discharge', 'gen', 'curtailed', 'soc', 'pv', 'genToBattery'];
    var out = {};
    keys.forEach(function (k) { out[k] = new Array(24).fill(0); });
    var days = 0;
    for (var d = 0; d < 365; d++) {
      if (E.seasonOfDay(d).id !== seasonId) continue;
      days++;
      for (var h = 0; h < 24; h++) {
        keys.forEach(function (k) { out[k][h] += H[k][d * 24 + h]; });
      }
    }
    keys.forEach(function (k) { out[k] = out[k].map(function (v) { return v / days; }); });
    return out;
  }

  function renderEnergy() {
    var seg = $('seasonSeg');
    seg.innerHTML = '';
    D.SEASONS.forEach(function (se) {
      var b = document.createElement('button');
      b.textContent = se.name;
      if (se.id === state.season) b.className = 'active';
      b.addEventListener('click', function () { state.season = se.id; renderEnergy(); });
      seg.appendChild(b);
    });
    var day = seasonAverageDay(state.season);
    var genToLoad = day.gen.map(function (g, i) { return Math.max(0, g - day.genToBattery[i] / EQ.inverter.effAcToBattery); });
    var labels = []; for (var h = 0; h < 24; h++) labels.push(('0' + h).slice(-2));
    C.stackedBars($('dayChart'), {
      labels: labels, unit: 'kWh', height: 250, labelEvery: 2,
      tipTitle: function (i) { return labels[i] + ':00 · PV ' + day.pv[i].toFixed(2) + ' kWh DC, curtailed ' + day.curtailed[i].toFixed(2); },
      series: [
        { name: 'Solar → load', color: COLORS.solar, values: day.direct },
        { name: 'Battery → load', color: COLORS.battery, values: day.discharge },
        { name: 'Generator → load', color: COLORS.gen, values: genToLoad }
      ],
      line: { name: 'Load', color: COLORS.load, values: day.load }
    });
    C.line($('daySocChart'), {
      values: day.soc.map(function (v) { return v * 100; }), max: 100, unit: '%', height: 140, color: COLORS.battery, area: true,
      xTicks: [0, 6, 12, 18, 23].map(function (i) { return { i: i, label: labels[i] }; }),
      tip: function (i) { return '<div class="tip-title">' + labels[i] + ':00</div>Average SOC <b>' + (day.soc[i] * 100).toFixed(0) + '%</b>'; }
    });

    var M = state.sim.byMonth;
    C.stackedBars($('monthChart'), {
      labels: D.MONTH_NAMES.slice(), unit: 'kWh', height: 250,
      series: [
        { name: 'Solar used', color: COLORS.solar, values: M.map(function (m) { return m.solarUsed; }) },
        { name: 'Generator', color: COLORS.gen, values: M.map(function (m) { return m.gen; }) }
      ],
      line: { name: 'Load', color: COLORS.load, values: M.map(function (m) { return m.load; }) },
      tipTitle: function (i) { return D.MONTH_NAMES[i] + ' · curtailed ' + kwh(M[i].curtailed); }
    });
    $('monthTable').innerHTML = '<div class="table-scroll"><table><thead><tr><th></th>' +
      D.MONTH_NAMES.map(function (m) { return '<th class="num">' + m + '</th>'; }).join('') + '<th class="num">Year</th></tr></thead><tbody>' +
      [['Load', 'load'], ['PV (DC)', 'pv'], ['Solar used', 'solarUsed'], ['Curtailed', 'curtailed'], ['Generator', 'gen']].map(function (r) {
        var tot = M.reduce(function (a, m) { return a + m[r[1]]; }, 0);
        return '<tr><td>' + r[0] + '</td>' + M.map(function (m) { return '<td class="num">' + Math.round(m[r[1]]) + '</td>'; }).join('') +
          '<td class="num"><b>' + Math.round(tot).toLocaleString() + '</b></td></tr>';
      }).join('') + '</tbody></table></div>';

    var soc = Array.prototype.map.call(state.sim.hourly.soc, function (v) { return v * 100; });
    var monthStarts = []; var acc = 0;
    D.DAYS_IN_MONTH.forEach(function (n, m) { monthStarts.push({ i: acc * 24, label: D.MONTH_NAMES[m] }); acc += n; });
    C.line($('socChart'), {
      values: soc, max: 100, unit: '%', height: 170, color: COLORS.battery, area: true, xTicks: monthStarts,
      tip: function (i) {
        var dd = Math.floor(i / 24), m = E.MONTH_OF_DAY[dd];
        return '<div class="tip-title">' + D.MONTH_NAMES[m] + ' day ' + (dd + 1) + ', ' + (i % 24) + ':00</div>SOC <b>' + soc[i].toFixed(0) + '%</b><br>Daily sun ' + state.sim.psh[dd].toFixed(2) + ' PSH' +
          (state.sim.hourly.gen[i] > 0 ? '<br>Generator <b>' + state.sim.hourly.gen[i].toFixed(1) + ' kWh</b>' : '');
      }
    });

    $('autonomyTable').innerHTML = '<table><thead><tr><th>Season</th><th class="num">Daily load</th><th class="num">PV / day</th><th class="num">Autonomy, average sun</th><th class="num">Autonomy, zero sun</th></tr></thead><tbody>' +
      state.aut.map(function (a) {
        var load = E.seasonalDailyLoad(a.season, state.d.springBaseKwh) + E.overheadKw(state.d, a.season) * 24;
        return '<tr' + (a.season.id === state.d.autonomySeason ? ' class="best"' : '') + '><td>' + a.season.name + '</td><td class="num">' + n1(load) + ' kWh</td>' +
          '<td class="num">' + n1(state.d.pvKw * state.d.pvDerate * a.season.psh) + ' kWh</td>' +
          '<td class="num">' + (a.solar.capped ? '14+ days' : n1(a.solar.days) + ' days') + '</td><td class="num">' + n1(a.dark.days) + ' days</td></tr>';
      }).join('') + '</tbody></table><p class="muted">Average-sun autonomy is the challenge\'s 3-day test; the zero-sun column is a snow-covered-array stress case.</p>';
  }

  // ── Generator tab ───────────────────────────────────────────────────────
  function renderGenerator() {
    var d = state.d;
    $('automation').innerHTML =
      '<p><b>Hardware path.</b> The BE7500ID moves from the manual transfer switch to the GridBOSS GEN port (125 A rating; the 6 kW generator draws 25 A at 240 V). A 2-wire start kit lets the GridBOSS start and stop it on a dry contact. The FlexBOSS21s charge the shared 48 V bank from generator AC at 94 %.</p>' +
      '<p><b>Inputs</b> every hour: battery SOC (BMS over CAN), load and PV power (FlexBOSS/GridBOSS CTs), and a 36-hour solar forecast (e.g. Environment Canada / Solcast irradiance converted to kWh with this array\'s size and derate).</p>' +
      '<p><b>Decision — forecast-aware (default).</b> Project SOC forward 36 h using the forecast. Start the generator only when that projection falls below the ' + d.minSocPct + '% floor plus a ' + d.reserveKwh + ' kWh reserve <i>and</i> the shortfall is within the next hour of running. Run at least ' + d.genMinRunH + ' h at full output (fewer cold starts, full-load efficiency). Stop as soon as the projection clears the reserve — i.e. store only what is needed to reach the next solar surplus, so generator fuel never displaces free sun the next morning.</p>' +
      '<p><b>Baseline — SOC trigger.</b> Conventional auto-start: on at ' + d.socStartPct + '% SOC, off at ' + d.socStopPct + '%. Simple, but it often fills the battery the evening before a sunny day, and that solar is then curtailed (zero export).</p>' +
      '<p><b>Limits handled.</b> Forecast error (σ = ' + d.forecastErrorPct + '% per day in the simulation), minimum run time, generator capacity, inverter charge-current and BMS 140 A/battery limits, and a last-resort start whenever load would go unserved. Servicing every 100 kWh and the 2% efficiency loss per service are tracked; the generator is replaced once efficiency falls below ' + Math.round(d.genReplaceAtEff * 100) + '%.</p>';

    var life = state.life;
    C.stackedBars($('genYearChart'), {
      labels: life.years.map(function (y) { return String(y.year); }), unit: '$', height: 220,
      series: [{ name: 'Generator cost', color: COLORS.gen, values: life.years.map(function (y) { return y.generator; }) }],
      tipTitle: function (i) { var y = life.years[i]; return 'Year ' + y.year + ' · ' + kwh(y.genKwh) + ' · ' + y.genServices + ' services' + (y.genReplacements ? ' · replaced' : ''); }
    });
    var totalServices = life.years.reduce(function (a, y) { return a + y.genServices; }, 0);
    var totalRepl = life.years.reduce(function (a, y) { return a + y.genReplacements; }, 0);
    var totalGen = life.years.reduce(function (a, y) { return a + y.generator; }, 0);
    $('genYearTable').innerHTML = '<p class="muted">' + d.horizonYears + ' years: ' + kwh(life.years.reduce(function (a, y) { return a + y.genKwh; }, 0)) +
      ', ' + totalServices + ' services, ' + totalRepl + ' replacement(s), ' + money(totalGen) + ' nominal (' + d.escalationPct + '%/yr escalation). Year-to-year kWh changes with PV ageing (' + EQ.panel.degradationPctPerYr + '%/yr).</p>';
  }

  function runComparison() {
    var btn = $('compareBtn');
    btn.disabled = true;
    btn.textContent = 'Running…';
    setTimeout(function () {
      var seeds = []; for (var i = 1; i <= 20; i++) seeds.push(i);
      var res = {};
      ['smart', 'soc'].forEach(function (st) {
        res[st] = seeds.map(function (seed) {
          var dd = Object.assign({}, state.d, { weatherMode: 'variable', weatherSeed: seed });
          return E.simulateSteadyYear(dd, { strategy: st }).totals;
        });
      });
      var q = function (arr, p) { var a = arr.slice().sort(function (x, y) { return x - y; }); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
      var row = function (name, st) {
        var g = res[st].map(function (t) { return t.gen; });
        var c = res[st].map(function (t) { return t.genCost; });
        var s = res[st].map(function (t) { return t.genStarts; });
        var cu = res[st].map(function (t) { return t.curtailed; });
        return '<tr><td>' + name + '</td><td class="num">' + kwh(q(g, 0.5)) + '</td><td class="num">' + kwh(q(g, 0.9)) + '</td><td class="num">' + money(q(c, 0.5)) + '</td><td class="num">' + money(q(c, 0.9)) + '</td><td class="num">' + q(s, 0.5) + '</td><td class="num">' + kwh(q(cu, 0.5)) + '</td></tr>';
      };
      var gs = res.smart.map(function (t) { return t.genCost; }).reduce(function (a, b) { return a + b; }, 0) / 20;
      var go = res.soc.map(function (t) { return t.genCost; }).reduce(function (a, b) { return a + b; }, 0) / 20;
      $('compareOut').innerHTML = '<table><thead><tr><th>Strategy</th><th class="num">Gen kWh P50</th><th class="num">P90</th><th class="num">Year-1 cost P50</th><th class="num">P90</th><th class="num">Starts P50</th><th class="num">Curtailed P50</th></tr></thead><tbody>' +
        row('Forecast-aware', 'smart') + row('SOC trigger', 'soc') + '</tbody></table>' +
        '<p class="muted">Mean year-1 generator cost: forecast-aware ' + money(gs) + ' vs SOC trigger ' + money(go) + ' → <b>' + money(go - gs) + '/yr saved (' + (go > 0 ? ((go - gs) / go * 100).toFixed(0) : 0) + '%)</b> on this design.</p>';
      btn.disabled = false;
      btn.textContent = 'Run again';
    }, 20);
  }

  // ── Optimizer tab ───────────────────────────────────────────────────────
  function runOptimizer() {
    var s = Object.assign({}, state.s);
    var grid = E.optimizerGrid(s, { panelStep: 4, batteryMax: 16 });
    var rows = [];
    var i = 0;
    var btn = $('optBtn');
    btn.disabled = true;
    state.optRunning = true;
    $('optProgress').hidden = false;
    (function next() {
      if (i >= grid.panels.length) {
        var best = null;
        rows.forEach(function (r) { if (r.feasible && (!best || r.lifecycle < best.lifecycle)) best = r; });
        state.opt = { rows: rows, best: best, grid: grid, settings: s };
        state.optRunning = false;
        btn.disabled = false;
        btn.textContent = 'Run again';
        $('optProgress').hidden = true;
        renderOptimizer();
        return;
      }
      var p = grid.panels[i++];
      for (var b = E.minimums(p, s).batteries; b <= grid.batteryMax; b++) rows.push(E.evaluate(s, B.costFn, p, b));
      $('optBar').style.width = (i / grid.panels.length * 100) + '%';
      setTimeout(next, 0);
    })();
  }

  function renderOptimizer() {
    var o = state.opt;
    if (!o) return;
    var panels = o.grid.panels;
    var bats = [];
    for (var b = o.grid.batteryMax; b >= 1; b--) {
      if (o.rows.some(function (r) { return r.batteries === b; })) bats.push(b);
    }
    var lookup = {};
    o.rows.forEach(function (r) { lookup[r.panels + ':' + r.batteries] = r; });
    var hl = o.best ? { r: bats.indexOf(o.best.batteries), c: panels.indexOf(o.best.panels) } : null;
    C.heatmap($('heatmap'), {
      rows: bats.map(String), cols: panels.map(String),
      rowTitle: 'batteries', colTitle: 'panels (440 W)',
      value: function (r, c) { var x = lookup[panels[c] + ':' + bats[r]]; return x && x.feasible ? x.lifecycle : null; },
      fmt: money, highlight: hl, capRatio: 1.5, emptyLabel: 'fails requirements or below datasheet minimum',
      tip: function (r, c) {
        var x = lookup[panels[c] + ':' + bats[r]];
        if (!x) return 'Below datasheet minimum';
        return '<div class="tip-title">' + x.panels + ' panels · ' + x.batteries + ' batteries · ' + x.inverters + ' inv</div>' +
          'Lifecycle <b>' + money(x.lifecycle) + '</b><br>Capex ' + money(x.capex) + '<br>Generator ' + kwh(x.genKwh) + '/yr<br>Winter autonomy ' + (x.autonomyDays > o.settings.autonomyDays ? '≥ ' + (o.settings.autonomyDays + 1) : n1(x.autonomyDays)) + ' days' +
          (x.feasible ? '' : '<br><b>Fails requirements</b>');
      },
      onClick: function (r, c) { applyDesign(panels[c], bats[r]); }
    });

    var feas = o.rows.filter(function (r) { return r.feasible; });
    if (!feas.length) { $('alternatives').innerHTML = '<p class="muted">No feasible design within the site limit.</p>'; return; }
    var minCap = feas.reduce(function (a, r) { return r.capex < a.capex ? r : a; });
    var minGen = feas.reduce(function (a, r) { return r.genKwh < a.genKwh || (r.genKwh === a.genKwh && r.lifecycle < a.lifecycle) ? r : a; });
    var within = feas.filter(function (r) { return r.lifecycle <= o.best.lifecycle * 1.02; });
    var leanest = within.reduce(function (a, r) { return r.capex < a.capex ? r : a; });
    var alts = [
      ['Lowest lifecycle cost', o.best],
      ['Lowest capex within 2% of optimum', leanest],
      ['Lowest capex that meets requirements', minCap],
      ['Least generator use', minGen]
    ];
    $('alternatives').innerHTML = '<table><thead><tr><th>Alternative</th><th class="num">Panels</th><th class="num">Batt.</th><th class="num">Inv.</th><th class="num">Capex</th><th class="num">Gen kWh/yr</th><th class="num">Opex yr 1</th><th class="num">Lifecycle</th><th></th></tr></thead><tbody>' +
      alts.map(function (a, i) {
        var r = a[1];
        return '<tr' + (i === 0 ? ' class="best"' : '') + '><td>' + a[0] + '</td><td class="num">' + r.panels + '</td><td class="num">' + r.batteries + '</td><td class="num">' + r.inverters +
          '</td><td class="num">' + money(r.capex) + '</td><td class="num">' + Math.round(r.genKwh) + '</td><td class="num">' + money(r.annualOpex) + '</td><td class="num">' + money(r.lifecycle) +
          '</td><td><button class="btn-secondary-sm" data-p="' + r.panels + '" data-b="' + r.batteries + '">Load</button></td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="muted">' + within.length + ' designs land within 2% of the optimum — the cost surface is flat near the minimum, so capex, roof area and risk appetite can decide between them.</p>';
    $('alternatives').querySelectorAll('button[data-p]').forEach(function (b) {
      b.addEventListener('click', function () { applyDesign(+b.dataset.p, +b.dataset.b); });
    });
  }

  // ── Budget tab ──────────────────────────────────────────────────────────
  function renderBudget() {
    var cap = state.cap, life = state.life, d = state.d;
    $('budgetKpis').innerHTML =
      kpi('Total installed (incl. GST/PST)', money(cap.total), money(cap.subtotal) + ' before tax') +
      kpi('Taxes', money(cap.pst + cap.gst), 'PST ' + money(cap.pst) + ' · GST ' + money(cap.gst)) +
      kpi('Year-1 operating cost', money(life.annualOpex), 'generator, O&M, standby utility') +
      kpi(d.horizonYears + '-yr lifecycle (NPV)', money(life.lifecycle), money(life.nominalOpex) + ' nominal opex');

    var cats = ['Equipment', 'Balance of system', 'Labour', 'Soft costs', 'Contingency'];
    var html = '<div class="table-scroll"><table><thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Unit cost</th><th class="num">Total</th><th>PST</th><th>Notes</th></tr></thead><tbody>';
    cats.forEach(function (c) {
      var ls = cap.lines.filter(function (l) { return l.category === c; });
      if (!ls.length) return;
      html += '<tr class="cat"><td colspan="7">' + c + '</td></tr>';
      ls.forEach(function (l) {
        html += '<tr><td>' + esc(l.item) + '</td><td class="num">' + (l.qty % 1 ? l.qty.toFixed(1) : l.qty) + '</td><td>' + l.unit + '</td><td class="num">' + money(l.unitCost) +
          '</td><td class="num">' + money(l.total) + '</td><td>' + (l.pst ? '7%' : '—') + '</td><td class="note">' + esc(l.note) + '</td></tr>';
      });
      html += '<tr class="sub"><td colspan="4">Subtotal — ' + c + '</td><td class="num">' + money(cap.byCategory[c]) + '</td><td colspan="2"></td></tr>';
    });
    html += '<tr class="sub"><td colspan="4">Pre-tax total</td><td class="num">' + money(cap.subtotal) + '</td><td colspan="2"></td></tr>';
    html += '<tr><td colspan="4">PST 7% on taxable goods (' + money(cap.pstBase) + ')</td><td class="num">' + money(cap.pst) + '</td><td colspan="2" class="note">PV panels, inverters, controllers, PV wiring exempt — PST Bulletin 203</td></tr>';
    html += '<tr><td colspan="4">GST 5% (' + money(cap.gstBase) + ')</td><td class="num">' + money(cap.gst) + '</td><td colspan="2" class="note">Permit fees excluded</td></tr>';
    html += '<tr class="total"><td colspan="4">Total installed cost</td><td class="num">' + money(cap.total) + '</td><td colspan="2"></td></tr>';
    html += '</tbody></table></div><p class="muted">No BC Hydro solar/battery rebate is included: those programs require a grid-connected, net-metered system, and this design exports nothing.</p>';
    $('budgetTable').innerHTML = html;

    C.stackedBars($('lifeChart'), {
      labels: life.years.map(function (y) { return String(y.year); }), unit: '$', height: 230,
      series: [
        { name: 'Generator', color: COLORS.gen, values: life.years.map(function (y) { return y.generator; }) },
        { name: 'O&M + standby utility', color: COLORS.aqua, values: life.years.map(function (y) { return y.om + y.utility; }) },
        { name: 'Inverter / battery replacement', color: COLORS.battery, values: life.years.map(function (y) { return y.inverters + y.batteries; }) }
      ],
      tipTitle: function (i) { return 'Year ' + life.years[i].year + ' · total ' + money(life.years[i].total); }
    });
    $('lifeTable').innerHTML = '<table><tbody>' +
      '<tr><td>Capital budget</td><td class="num">' + money(life.capex) + '</td></tr>' +
      '<tr><td>NPV of operating costs (' + d.discountPct + '% discount, ' + d.escalationPct + '%/yr escalation)</td><td class="num">' + money(life.npvOpex) + '</td></tr>' +
      '<tr><td>Inverter replacement (year ' + d.inverterReplaceYear + ')</td><td class="num">' + money(life.years.reduce(function (a, y) { return a + y.inverters; }, 0)) + '</td></tr>' +
      '<tr><td>Battery replacement (year ' + d.batteryReplaceYear + ')</td><td class="num">' + money(life.years.reduce(function (a, y) { return a + y.batteries; }, 0)) + '</td></tr>' +
      '<tr class="total"><td>Lifecycle cost (NPV)</td><td class="num">' + money(life.lifecycle) + '</td></tr></tbody></table>';

    var householdKwh = D.SEASONS.reduce(function (a, se) { return a + E.seasonalDailyLoad(se, d.springBaseKwh) * 365 / 4; }, 0);
    var bill = B.bcHydroAnnual(householdKwh);
    var npvBill = 0;
    for (var y = 1; y <= d.horizonYears; y++) npvBill += bill * Math.pow(1 + d.escalationPct / 100, y - 1) / Math.pow(1 + d.discountPct / 100, y);
    $('gridCompare').innerHTML =
      '<p>The same household load (' + kwh(householdKwh) + '/yr) on BC Hydro\'s residential rate (10.97¢ / 14.08¢ per kWh, April 2026) costs about <b>' + money(bill) + '/yr</b> incl. GST — <b>' + money(npvBill) + '</b> NPV over ' + d.horizonYears + ' years.</p>' +
      '<p>Victoria\'s grid power is cheap and ~98% clean, so this system is <b>not</b> justified by bill savings. The business case is the challenge brief: full independence and whole-home resilience for a 400 A service. The useful financial question is therefore <i>which off-grid design is cheapest over its life</i> — the Optimizer tab — and how much automation saves on the generator (Generator tab).</p>';
  }

  function exportCsv() {
    var rows = [['Category', 'Item', 'Qty', 'Unit', 'Unit cost', 'Total', 'PST taxable', 'Note']];
    state.cap.lines.forEach(function (l) { rows.push([l.category, l.item, l.qty, l.unit, l.unitCost.toFixed(2), l.total.toFixed(2), l.pst ? 'yes' : 'no', l.note]); });
    rows.push(['Tax', 'PST 7%', '', '', '', state.cap.pst.toFixed(2), '', '']);
    rows.push(['Tax', 'GST 5%', '', '', '', state.cap.gst.toFixed(2), '', '']);
    rows.push(['Total', 'Total installed cost', '', '', '', state.cap.total.toFixed(2), '', '']);
    var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'victoria-offgrid-budget.csv';
    a.click();
  }

  // ── Assumptions tab ─────────────────────────────────────────────────────
  function renderAssumptions() {
    var d = state.d;
    $('assumptions').innerHTML =
      '<h3>Model</h3><ul>' +
      '<li>Hourly simulation, 8,760 steps. Load = seasonal daily kWh × challenge spring hour-shape + inverter idle draw (' + EQ.inverter.idleW + ' W each) + battery heaters in winter.</li>' +
      '<li>PV (DC) = panels × 0.44 kW × daily peak sun hours × ' + d.pvDerate + ' derate × challenge hourly production shape. Seasons: Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov fall.</li>' +
      '<li>"Day-to-day variable" weather draws correlated daily sun (AR(1), ρ = 0.6, log-normal) and rescales each season to exactly the challenge mean, capped at clear-sky values.</li>' +
      '<li>FlexBOSS21 efficiencies: PV→load 97%, PV→battery 94.5%, battery→load 94%, AC→battery 94%. PV AC output capped at 16 kW/inverter; battery discharge at 12 kW/inverter and 140 A/battery.</li>' +
      '<li>Battery usable window ' + d.minSocPct + '–100% SOC. Each year is simulated twice so 1 January starts from the steady-state battery level, not a free full charge.</li>' +
      '<li>Generator: $' + d.genCostPerKwh.toFixed(2) + '/kWh ÷ efficiency, $' + d.genServiceCost + ' service every 100 kWh, efficiency × 0.98 per service, replaced at ' + Math.round(d.genReplaceAtEff * 100) + '% for ' + money(d.genReplaceCost) + ' (assumption). Service count carries across years.</li>' +
      '<li>Whole-home backup test: full battery at midnight, average season sun, no generator; must carry load for ' + d.autonomyDays + ' days.</li>' +
      '<li>No export: surplus PV is curtailed. The BC Hydro connection is kept as a standby service only (basic charge).</li>' +
      '</ul><h3>Budget (Victoria, BC)</h3><ul>' +
      '<li>Equipment at challenge unit prices; panel price includes racking. Existing generator reused at $0.</li>' +
      '<li>Labour: electrician ' + money(d.electricianRate) + '/h and installer ' + money(d.installerRate) + '/h billed; hours per unit are in budget.js.</li>' +
      '<li>City of Victoria electrical permit: $441 + 1.25% of work value over $20,000 (owner-supplied equipment included). Building permit for ground-mount: $100 + 1.40% of construction value.</li>' +
      '<li>PST 7% only on goods not exempt under PST Bulletin 203 — batteries, panelboards, disconnect, splitter, general electrical. GST 5% on everything except permit fees.</li>' +
      '<li>Roof-mounted modules get module-level rapid shutdown (CEC Rule 64-218); ground/carport modules need footings and a trench instead.</li>' +
      '<li>Contingency ' + d.contingencyPct + '%, contractor overhead ' + d.overheadPct + '% on BOS + labour, freight ' + d.freightPct + '% of equipment for Vancouver Island delivery.</li>' +
      '</ul><h3>Sources</h3><ul>' +
      D.SOURCES.map(function (s) { return '<li>' + (s.url ? '<a href="' + s.url + '" target="_blank" rel="noopener">' + s.label + '</a>' : s.label) + '</li>'; }).join('') +
      '</ul>';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WIRING
  // ═══════════════════════════════════════════════════════════════════════
  function init() {
    renderControls();
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('active', x === t); });
        document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + t.dataset.tab); });
        state.tab = t.dataset.tab;
        render();
      });
    });
    $('compareBtn').addEventListener('click', runComparison);
    $('optBtn').addEventListener('click', runOptimizer);
    $('csvBtn').addEventListener('click', exportCsv);
    $('resetBtn').addEventListener('click', function () {
      S.clear();
      state.s = S.defaults();
      renderControls();
      recompute();
    });
    window.addEventListener('beforeprint', function () {
      ['energy', 'generator', 'budget', 'assumptions'].forEach(function (t) { state.tab = t; render(); });
      state.tab = 'overview';
    });
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(render, 150); });
    recompute();
    var initial = location.hash.replace('#', '');
    var tab = document.querySelector('.tab[data-tab="' + initial + '"]');
    if (tab) tab.click();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
