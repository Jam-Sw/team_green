/**
 * Assumptions tab — ui/tabs/assumptions.js
 * Every modelling and budget assumption, with sources. Values shown here are
 * read live from the settings, so the text always matches the numbers.
 */
(function () {
  'use strict';

  var U = window.SunUI, D = window.SunData, EQ = D.EQUIPMENT;

  U.tab({
    id: 'assumptions',
    title: 'Assumptions',
    intro: 'What the model assumes and where each number comes from.',
    html: '<div class="grid-2" id="assumptions"></div>',

    render: function (m) {
      var d = m.d;
      function list(items) { return '<ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>'; }
      U.$('assumptions').innerHTML =
        U.card('Model', '<div class="prose">' + list([
          'Simulates all 8,760 hours of a year. Load = seasonal daily kWh × the challenge\'s hourly shape + inverter idle draw (' + EQ.inverter.idleW + ' W each) + winter battery heaters.',
          'Solar = panels × 0.44 kW × daily peak sun hours × ' + d.pvDerate + ' derate × the challenge\'s hourly shape. Winter is Dec–Feb, spring Mar–May, summer Jun–Aug, fall Sep–Nov.',
          '"Day-to-day variable" weather draws correlated daily sun, rescaled so each season matches the challenge average.',
          'FlexBOSS21 efficiency: solar→home 97%, solar→battery 94.5%, battery→home 94%, generator→battery 94%. Solar capped at 16 kW and discharge at 12 kW per inverter.',
          'Battery is used between ' + d.minSocPct + '% and 100%. Each year is simulated twice so 1 January starts from a realistic charge.',
          'Generator: $' + d.genCostPerKwh.toFixed(2) + '/kWh ÷ efficiency, $' + d.genServiceCost + ' service every 100 kWh, 2% efficiency lost per service, replaced below ' + Math.round(d.genReplaceAtEff * 100) + '% for ' + U.money(d.genReplaceCost) + '.',
          'Backup test: full battery at midnight, average seasonal sun, no generator, for ' + d.autonomyDays + ' days.',
          'No export: surplus solar is curtailed. BC Hydro stays connected as standby only.'
        ]) + '</div>') +
        U.card('Budget (Victoria, BC)', '<div class="prose">' + list([
          'Equipment at challenge prices; panel price includes racking. The existing generator is reused at $0.',
          'Labour: electrician ' + U.money(d.electricianRate) + '/h, installer ' + U.money(d.installerRate) + '/h. Hours per unit are in budget.js.',
          'City of Victoria electrical permit: $441 + 1.25% of work value over $20,000. Ground-mount building permit: $100 + 1.40% of construction value.',
          'PST 7% only on goods not exempt under PST Bulletin 203. GST 5% on everything except permit fees.',
          'Roof-mounted panels need rapid shutdown (CEC 64-218); ground-mounted ones need footings and a trench instead.',
          'Contingency ' + d.contingencyPct + '%, contractor overhead ' + d.overheadPct + '%, freight ' + d.freightPct + '% of equipment for Vancouver Island delivery.'
        ]) + '</div>') +
        U.card('Sources', '<div class="prose">' + list(D.SOURCES.map(function (s) {
          return s.url ? '<a href="' + s.url + '" target="_blank" rel="noopener">' + s.label + '</a>' : s.label;
        })) + '</div>');
    }
  });
})();
