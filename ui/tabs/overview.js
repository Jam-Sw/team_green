/**
 * Overview tab — ui/tabs/overview.js
 * What gets built, whether it meets the brief, and how it is wired.
 */
(function () {
  'use strict';

  var U = window.SunUI, EQ = window.SunData.EQUIPMENT;

  U.tab({
    id: 'overview',
    title: 'Overview',
    intro: 'The recommended system, the parts list, and a check against every challenge requirement.',
    html:
      '<div class="kpis" id="kpis"></div>' +
      '<div class="grid-2">' +
        U.card('Parts list', '<div id="designSummary"></div>') +
        U.card('Challenge requirements', '<ul class="checklist" id="checklist"></ul>', '<span class="pill" id="checkCount"></span>') +
      '</div>' +
      U.card('How it connects', '<div id="sld" class="sld"></div>') +
      '<details class="card more"><summary><h3>How the solar strings are sized</h3></summary><div id="strings"></div></details>',

    render: function (m) {
      var d = m.d, T = m.T, t = m.target;

      U.$('kpis').innerHTML =
        U.kpi('Installed cost', U.money(m.cap.total), 'incl. GST + PST · $' + (m.cap.total / (d.pvKw * 1000)).toFixed(2) + '/W') +
        U.kpi('Solar · storage', U.n1(d.pvKw) + ' kW · ' + Math.round(d.usableKwh) + ' kWh', d.panels + ' panels · ' + d.batteries + ' batteries (usable)') +
        U.kpi(t.season.name + ' backup', window.SunModel.days(t.solar) + ' days', 'no generator · target ' + d.autonomyDays + ' days') +
        U.kpi('Generator, year 1', U.kwh(T.gen), U.pct(T.solarFraction) + ' of load from solar');

      U.$('designSummary').innerHTML = U.table(
        [{ t: 'Component' }, { t: 'Qty', num: true }, { t: 'Why this many' }],
        [
          ['JA Solar 440 W panel', d.panels, d.layout.count + ' strings of ' + U.uniq(d.layout.strings) + ' · ' + U.n1(d.pvKw) + ' kWp'],
          ['EG4 FlexBOSS21 inverter', d.inverters, 'largest of: peak load ' + d.minimums.invForLoad + ', PV ' + d.minimums.invForPv + ', service ' + d.minimums.gbForService],
          ['EG4 GridBOSS', d.gridboss, d.serviceA + ' A service ÷ 200 A each'],
          ['EG4 280Ah battery', d.batteries, U.n1(d.batteryKwh) + ' kWh · minimum ' + d.minimums.batteries + ' (600 Ah per inverter)'],
          ['400 A fused disconnect', 1, 'service entrance, kept as utility standby'],
          ['Distribution splitter', 1, 'one 200 A leg per GridBOSS'],
          ['200 A panel', Math.ceil(d.serviceA / 200), 'one per GridBOSS'],
          ['BE7500ID generator', 1, 'existing · moves to the GridBOSS GEN port']
        ].map(function (r) { return [r[0], r[1], '<span class="note">' + r[2] + '</span>']; })
      );

      U.$('checkCount').textContent = (m.checks.length - m.failed) + ' / ' + m.checks.length + ' met';
      U.$('checkCount').className = 'pill ' + (m.failed ? 'bad' : 'good');
      U.$('checklist').innerHTML = m.checks.map(function (c) {
        return '<li class="' + (c.ok ? 'pass' : 'fail') + '"><span class="icon">' + (c.ok ? '✓' : '✗') + '</span>' +
          '<span>' + c.text + ' <span class="fr">' + c.fr + '</span><span class="detail">' + c.detail + '</span></span></li>';
      }).join('');

      window.SunSld.render(U.$('sld'), d);
      renderStrings(d);
    }
  });

  function renderStrings(d) {
    var sd = d.minimums.stringDesign, P = EQ.panel, I = EQ.inverter;
    U.$('strings').innerHTML = U.table([{ t: 'Rule' }, { t: 'This design', num: true }], [
      ['Cold open-circuit voltage: Voc × (1 + (T<sub>min</sub> − 25) × −0.25%)', P.vocV + ' V at ' + d.designLowC + ' °C → <b>' + sd.vocColdV.toFixed(2) + ' V</b>'],
      ['Most panels per string (stay under ' + I.mpptHighProtectV + ' V)', '⌊' + I.mpptHighProtectV + ' / ' + sd.vocColdV.toFixed(2) + '⌋ = <b>' + sd.maxSeries + '</b>'],
      ['Fewest panels per string (hot Vmp ≥ ' + I.mpptFullPowerV[0] + ' V at ' + d.designHotCellC + ' °C)', '<b>' + sd.minSeries + '</b>'],
      ['Strings in this design', d.layout.count + ' × ' + U.uniq(d.layout.strings) + ' panels, ' + d.layout.perInverter + ' per inverter (of ' + sd.stringsPerInverter + ')'],
      ['Cold string Voc / hot string Vmp', U.n1(Math.max.apply(null, d.layout.strings) * sd.vocColdV) + ' V / ' + U.n1(Math.min.apply(null, d.layout.strings) * sd.vmpHotV) + ' V'],
      ['Strings per MPPT (Isc ' + P.iscA + ' A vs 31/31/19 A)', sd.stringsPerMppt.join(' / ')]
    ]);
  }
})();
