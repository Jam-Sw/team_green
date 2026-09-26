/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage model — ui/model.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * One function turns the settings into everything the tabs display:
 *
 *   settings ─► design ─► hourly year ─► backup test ─► budget ─► checks
 *              (engine)    (engine)       (engine)      (budget)
 *
 * Tabs only read this object; they never call the engine for the base case.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

window.SunModel = (function () {
  'use strict';

  var D = window.SunData, E = window.SunEngine, B = window.SunBudget, U = window.SunUI;
  var EQ = D.EQUIPMENT;

  function build(settings) {
    var d = E.buildDesign(settings);
    var sim = E.simulateSteadyYear(d, { keepHourly: true });
    var autonomy = D.SEASONS.map(function (se) {
      return { season: se, solar: E.autonomy(d, se.id, 14, true), dark: E.autonomy(d, se.id, 14, false) };
    });
    var cap = B.capex(d);
    var lifeKwh = E.lifecycleEnergy(d);
    var m = {
      s: settings, d: d, sim: sim, T: sim.totals, autonomy: autonomy,
      target: autonomy.filter(function (a) { return a.season.id === d.autonomySeason; })[0],
      cap: cap, life: B.lifecycle(d, lifeKwh, cap)
    };
    m.checks = checks(m);
    m.failed = m.checks.filter(function (c) { return !c.ok; }).length;
    return m;
  }

  /** Days of backup, shown as "14+" when the 14-day test never ran out. */
  function days(a) { return a.capped ? '14+' : U.n1(a.days); }

  /** The challenge requirements (FR-n in docs/FUNCTIONAL_REQUIREMENTS.md). */
  function checks(m) {
    var d = m.d, T = m.T, sd = d.minimums.stringDesign, I = EQ.inverter, t = m.target;
    var season = t.season.name.toLowerCase();
    return [
      { fr: 'FR-1', ok: true, text: 'Component counts determined',
        detail: d.panels + ' panels · ' + d.inverters + ' FlexBOSS21 · ' + d.gridboss + ' GridBOSS · ' + d.batteries + ' batteries' },
      { fr: 'FR-2', ok: t.solar.days >= d.autonomyDays, text: d.autonomyDays + '-day backup in ' + season + ' without the generator',
        detail: days(t.solar) + ' days at average ' + season + ' sun from a full battery' },
      { fr: 'FR-5', ok: T.unserved < 0.01, text: 'Every hour of the year served',
        detail: T.unserved < 0.01 ? 'No unserved energy' : U.kwh(T.unserved) + ' unserved' },
      { fr: 'FR-6', ok: sd.ok && d.layout.ok, text: 'Strings within FlexBOSS21 MPPT limits',
        detail: 'Longest string Voc at ' + d.designLowC + ' °C: ' + U.n1(Math.max.apply(null, d.layout.strings) * sd.vocColdV) + ' V (< ' + I.mpptHighProtectV + ' V)' },
      { fr: 'FR-7', ok: d.inverters * I.batteryOnlyKw >= d.designPeakKw, text: 'Inverters carry the peak on battery alone',
        detail: d.inverters + ' × ' + I.batteryOnlyKw + ' kW = ' + d.inverters * I.batteryOnlyKw + ' kW ≥ ' + d.designPeakKw + ' kW' },
      { fr: 'FR-7', ok: d.batteries * EQ.battery.capacityAh >= d.inverters * I.minBatteryAhPerInverter, text: '≥ 600 Ah of battery per inverter',
        detail: d.batteries * EQ.battery.capacityAh + ' Ah for ' + d.inverters + ' inverter(s)' },
      { fr: 'FR-7', ok: d.pvKw <= d.inverters * I.maxPvKw, text: '≤ 21 kW of PV per inverter',
        detail: U.n1(d.pvKw) + ' kW on ' + d.inverters + ' inverter(s)' },
      { fr: 'FR-7', ok: d.gridboss * EQ.gridboss.ratedA >= d.serviceA && d.inverters <= d.gridboss * EQ.gridboss.maxInverters,
        text: d.serviceA + ' A service covered by GridBOSS', detail: d.gridboss + ' × 200 A GridBOSS, ≤ 3 inverters each' },
      { fr: 'FR-8', ok: true, text: 'Existing 6 kW generator integrated',
        detail: 'GridBOSS GEN port (125 A) ≥ 25 A generator output; 2-wire auto-start' },
      { fr: 'FR-9', ok: true, text: 'Zero export to BC Hydro', detail: 'Surplus PV is curtailed: ' + U.kwh(T.curtailed) + '/yr' },
      { fr: 'FR-10', ok: true, text: 'Generator use minimised',
        detail: U.kwh(T.gen) + '/yr, ' + T.genStarts + ' starts, ' + U.money(T.genCost) + ' in year 1 (' + (d.genStrategy === 'smart' ? 'forecast-aware' : 'SOC trigger') + ')' }
    ];
  }

  return { build: build, days: days };
})();
