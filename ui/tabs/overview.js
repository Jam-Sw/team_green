/**
 * Overview tab — ui/tabs/overview.js
 * The answer first: what gets built, whether it meets the brief, and how it
 * is wired.
 */
(function () {
  'use strict';

  var U = window.SunUI, EQ = window.SunData.EQUIPMENT;

  U.tab({
    id: 'overview',
    title: 'Overview',

    // One sentence that states the recommendation and why it works.
    intro: function (m) {
      var d = m.d, t = m.target, n = m.checks.length;
      var what = '<b>' + d.panels + ' panels, ' + d.inverters + ' inverters and ' + d.batteries + ' batteries</b>';
      if (m.failed) {
        return what + ' fail ' + m.failed + ' of ' + n + ' challenge requirements. The list below shows which; the Optimizer tab finds designs that pass.';
      }
      return what + ' meet all ' + n + ' challenge requirements for <b>' + U.money(m.cap.total) + '</b> installed. ' +
        'In ' + t.season.name.toLowerCase() + ' a full battery alone lasts <b>' + window.SunModel.days(t.solar) + ' days</b>, ' +
        'and the generator covers ' + U.pct(1 - m.T.solarFraction) + ' of the year\'s energy.';
    },

    html:
      '<div class="kpis" id="kpis"></div>' +
      '<div class="grid-2">' +
        '<div>' +
          U.card('Parts list', U.caption('Each count comes from a rule; the right column says which.') + '<div id="designSummary"></div>') +
          '<details class="card more"><summary><h3>How the solar strings are sized</h3></summary>' +
            U.caption('Panels are wired in series into strings. On a cold morning a string\'s voltage rises, so it must stay under the inverter\'s limit; ' +
              'on a hot afternoon it falls, so it must stay inside the inverter\'s working range.') +
            '<div id="strings"></div></details>' +
        '</div>' +
        U.card('Challenge requirements', U.caption('Checked against the simulated year. Change a setting and the list updates.') +
          '<ul class="checklist" id="checklist"></ul>', '<span class="pill" id="checkCount"></span>') +
      '</div>' +
      U.card('How it connects', U.caption('Follow the numbers from the sun to the house. Point at a step to highlight it.') + '<div id="sld" class="sld"></div>'),

    render: function (m) {
      var d = m.d, T = m.T, t = m.target;

      U.$('kpis').innerHTML =
        U.kpi('Installed cost', U.money(m.cap.total), 'incl. GST and PST · $' + (m.cap.total / (d.pvKw * 1000)).toFixed(2) + ' per watt') +
        U.kpi('Solar · storage', U.n1(d.pvKw) + ' kW · ' + Math.round(d.usableKwh) + ' kWh', d.panels + ' panels · ' + d.batteries + ' batteries, usable') +
        U.kpi(t.season.name + ' backup', window.SunModel.days(t.solar) + ' days', 'battery only · target ' + d.autonomyDays + ' days') +
        U.kpi('Generator', U.kwh(T.gen) + '/yr', 'solar covers ' + U.pct(T.solarFraction) + ' of the home');

      U.$('designSummary').innerHTML = U.table(
        [{ t: 'Part', nowrap: true }, { t: 'Qty', num: true }, { t: 'Why this many' }],
        parts(d).map(function (r) { return [r[0], r[1], '<span class="note">' + r[2] + '</span>']; })
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

  /** Each part with the rule that sets its count (see SunEngine.minimums). */
  function parts(d) {
    var mn = d.minimums, I = EQ.inverter;
    var inv = [];
    if (mn.invForLoad === mn.inverters) inv.push('the ' + d.designPeakKw + ' kW peak');
    if (mn.invForPv === mn.inverters) inv.push(U.n1(d.pvKw) + ' kW of solar');
    if (mn.gbForService === mn.inverters) inv.push('one per GridBOSS');
    inv = inv.length > 1 ? inv.slice(0, -1).join(', ') + ' and ' + inv[inv.length - 1] : inv[0];
    var batReason = mn.batForAh >= mn.batForPower
      ? I.minBatteryAhPerInverter + ' Ah per inverter'
      : 'the ' + d.designPeakKw + ' kW peak (' + EQ.battery.maxContinuousA + ' A each)';
    function chosen(n, min) { return n > min ? 'you chose ' + n + '; ' : ''; }
    return [
      ['JA Solar 440 W panel', d.panels, d.layout.count + ' strings of ' + U.span(d.layout.strings) + ' · ' + U.n1(d.pvKw) + ' kW'],
      ['EG4 FlexBOSS21 inverter', d.inverters, chosen(d.inverters, mn.inverters) + 'at least ' + mn.inverters + ' for ' + inv],
      ['EG4 GridBOSS', d.gridboss, d.gridboss > mn.gbForService
        ? 'up to ' + EQ.gridboss.maxInverters + ' inverters each'
        : 'one per ' + EQ.gridboss.ratedA + ' A of service'],
      ['EG4 280Ah battery', d.batteries, U.n1(d.batteryKwh) + ' kWh · ' + chosen(d.batteries, mn.batteries) + 'at least ' + mn.batteries + ' for ' + batReason],
      [d.serviceA + ' A fused disconnect', 1, 'service entrance; BC Hydro stays as standby'],
      ['Distribution splitter', 1, 'one 200 A leg per GridBOSS'],
      ['200 A panel', Math.ceil(d.serviceA / 200), 'one per GridBOSS'],
      ['BE7500ID generator', 1, 'existing; moves to the GridBOSS generator port']
    ];
  }

  function renderStrings(d) {
    var sd = d.minimums.stringDesign, P = EQ.panel, I = EQ.inverter;
    U.$('strings').innerHTML = U.table([{ t: 'Rule' }, { t: 'This design', num: true }], [
      ['Panel voltage on the coldest morning (Voc at ' + d.designLowC + ' °C)', P.vocV + ' V → <b>' + sd.vocColdV.toFixed(2) + ' V</b>'],
      ['Most panels per string, staying under ' + I.mpptHighProtectV + ' V', '⌊' + I.mpptHighProtectV + ' ÷ ' + sd.vocColdV.toFixed(2) + '⌋ = <b>' + sd.maxSeries + '</b>'],
      ['Fewest panels per string, staying above ' + I.mpptFullPowerV[0] + ' V when hot (' + d.designHotCellC + ' °C)', '<b>' + sd.minSeries + '</b>'],
      ['Strings in this design', d.layout.count + ' strings of ' + U.span(d.layout.strings) + ' panels, ' + d.layout.perInverter + ' per inverter (' + sd.stringsPerInverter + ' inputs)'],
      ['String voltage: cold maximum / hot minimum', U.n1(Math.max.apply(null, d.layout.strings) * sd.vocColdV) + ' V / ' + U.n1(Math.min.apply(null, d.layout.strings) * sd.vmpHotV) + ' V'],
      ['Strings per inverter input (panel current ' + P.iscA + ' A; inputs rated 31 / 31 / 19 A)', sd.stringsPerMppt.join(' / ')]
    ]);
  }
})();
