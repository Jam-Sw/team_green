/**
 * Assumptions tab — ui/tabs/assumptions.js
 * What the model assumes, the terms it uses, and where the numbers come
 * from. Values are read live from the settings, so the text always matches.
 */
(function () {
  'use strict';

  var U = window.SunUI, D = window.SunData, EQ = D.EQUIPMENT;

  U.tab({
    id: 'assumptions',
    title: 'Assumptions',
    intro: 'What the model assumes, what its terms mean, and where each number comes from.',
    html: '<div class="grid-2" id="assumptions"></div>',

    render: function (m) {
      var d = m.d;
      function list(items) { return '<ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>'; }
      function terms(pairs) {
        return '<dl class="terms">' + pairs.map(function (p) { return '<dt>' + p[0] + '</dt><dd>' + p[1] + '</dd>'; }).join('') + '</dl>';
      }
      U.$('assumptions').innerHTML =
        '<div>' +
        U.card('Model', '<div class="prose">' + list([
          'Every hour of a year is simulated (8,760 steps). Home use follows the challenge\'s daily shape, plus inverter standby (' + EQ.inverter.idleW + ' W each) and winter battery heaters.',
          'Solar = panels × 0.44 kW × the day\'s peak sun hours × ' + d.pvDerate + ' for losses, spread over the challenge\'s hourly shape.',
          'Seasons: winter Dec–Feb, spring Mar–May, summer Jun–Aug, fall Sep–Nov. "Day to day" weather varies the sun each day but keeps each season\'s average.',
          'Inverter efficiency: solar → home 97%, solar → battery 94.5%, battery → home 94%, generator → battery 94%. Each inverter passes at most 16 kW of solar and 12 kW from the battery.',
          'The battery is used between ' + d.minSocPct + '% and 100%. Each year is simulated twice, so 1 January starts from a realistic level.',
          'Generator: $' + d.genCostPerKwh.toFixed(2) + ' fuel per kWh ÷ efficiency plus a $' + d.genCarbonPricePerKwh.toFixed(2) + ' per-kWh carbon-price add-on, a $' + d.genServiceCost + ' service every 100 kWh, 2% efficiency lost per service, replaced at ' + Math.round(d.genReplaceAtEff * 100) + '% for ' + U.money(d.genReplaceCost) + '.',
          'Backup test: full battery at midnight, average ' + m.target.season.name.toLowerCase() + ' sun, no generator, for ' + d.autonomyDays + ' days.',
          'This is completely off-grid: there is no utility connection. Surplus solar is turned down once the batteries are full.'
        ]) + '</div>') +
        U.card('Budget (Victoria, BC)', '<div class="prose">' + list([
          'Equipment at the challenge\'s prices; the panel price includes racking. The existing generator is reused at no cost.',
          'Labour: electrician ' + U.money(d.electricianRate) + '/h, installer ' + U.money(d.installerRate) + '/h. Hours per task are in the Budget tab\'s line items.',
          'City of Victoria electrical permit: $441 + 1.25% of the work value over $20,000. Ground-mount building permit: $100 + 1.40% of the construction value.',
          'PST 7% only on goods not exempt under PST Bulletin 203. GST 5% on everything except permit fees.',
          'Roof panels need rapid-shutdown devices (CEC 64-218); ground-mounted panels need footings and a trench instead.',
          'Contingency ' + d.contingencyPct + '%, contractor overhead ' + d.overheadPct + '%, freight ' + d.freightPct + '% of equipment for Vancouver Island delivery.'
        ]) + '</div>') +
        '</div><div>' +
        U.card('Terms', terms([
          ['kW, kWh', 'kW is power at one moment; kWh is energy over time. 1 kW for 1 hour is 1 kWh.'],
          ['Battery level', 'How full the battery is, in percent (state of charge).'],
          ['Usable storage', 'The energy between the lowest allowed battery level (' + d.minSocPct + '%) and full.'],
          ['Peak sun hours', 'A day\'s sunlight counted as hours of full-strength sun.'],
          ['String', 'Panels wired in series into one inverter input.'],
          ['Voc', 'A panel\'s voltage with nothing connected. It rises on cold mornings, which limits how many panels fit in a string.'],
          ['MPPT input', 'An inverter input that keeps its strings at their most productive voltage.'],
          ['Unused solar', 'Solar the home can\'t use and the full battery can\'t store. With no export, the inverters turn it down (curtailment).'],
          ['Typical, bad year', 'The middle of 20 simulated weather years (P50), and a year worse than 9 in 10 (P90).'],
          ['Today\'s dollars', 'Future costs discounted at ' + d.discountPct + '% a year so they can be added to money spent now (net present value).'],
          ['Balance of system', 'Everything besides the main equipment: wiring, mounts, safety devices.'],
          ['FlexBOSS21', 'EG4 hybrid inverter: solar in, battery in and out, 240 V AC out.'],
          ['GridBOSS', 'EG4 microgrid switch. It joins the inverters, generator and house panels, and picks the source.']
        ])) +
        U.card('Sources', '<div class="prose">' + list(D.SOURCES.map(function (s) {
          return s.url ? '<a href="' + s.url + '" target="_blank" rel="noopener">' + s.label + '</a>' : s.label;
        })) + '</div>') +
        '</div>';
    }
  });
})();
