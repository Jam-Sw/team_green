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
    var ah = d.batteries * EQ.battery.capacityAh;
    return [
      { fr: 'FR-1', ok: true, text: 'Every part counted from the datasheet rules',
        detail: d.panels + ' panels · ' + d.inverters + ' inverters · ' + d.gridboss + ' GridBOSS · ' + d.batteries + ' batteries' },
      { fr: 'FR-2', ok: t.solar.days >= d.autonomyDays, text: d.autonomyDays + '-day ' + season + ' backup without the generator',
        detail: 'A full battery lasts ' + days(t.solar) + ' days at average ' + season + ' sun' },
      { fr: 'FR-5', ok: T.unserved < 0.01, text: 'Power in every hour of the year',
        detail: T.unserved < 0.01 ? 'No hour goes without power' : U.kwh(T.unserved) + ' short over the year' },
      { fr: 'FR-6', ok: sd.ok && d.layout.ok, text: 'Panel strings within the inverter\'s voltage limits',
        detail: 'Coldest-morning string voltage ' + U.n1(Math.max.apply(null, d.layout.strings) * sd.vocColdV) + ' V, limit ' + I.mpptHighProtectV + ' V' },
      { fr: 'FR-7', ok: d.inverters * I.batteryOnlyKw >= d.designPeakKw, text: 'Inverters carry the peak on battery alone',
        detail: d.inverters + ' × ' + I.batteryOnlyKw + ' kW = ' + d.inverters * I.batteryOnlyKw + ' kW for a ' + d.designPeakKw + ' kW peak' },
      { fr: 'FR-7', ok: ah >= d.inverters * I.minBatteryAhPerInverter, text: 'At least 600 Ah of battery per inverter',
        detail: ah.toLocaleString() + ' Ah for ' + d.inverters + ' inverter' + (d.inverters > 1 ? 's' : '') },
      { fr: 'FR-7', ok: d.pvKw <= d.inverters * I.maxPvKw, text: 'At most ' + I.maxPvKw + ' kW of solar per inverter',
        detail: U.n1(d.pvKw) + ' kW on ' + d.inverters + ' inverter' + (d.inverters > 1 ? 's' : '') + ' (' + d.inverters * I.maxPvKw + ' kW max)' },
      { fr: 'FR-7', ok: d.gridboss * EQ.gridboss.ratedA >= d.serviceA && d.inverters <= d.gridboss * EQ.gridboss.maxInverters,
        text: 'The ' + d.serviceA + ' A service is covered by GridBOSS units',
        detail: d.gridboss + ' × ' + EQ.gridboss.ratedA + ' A, up to ' + EQ.gridboss.maxInverters + ' inverters each' },
      { fr: 'FR-8', ok: true, text: 'Existing 6 kW generator connected',
        detail: 'GridBOSS generator port (125 A) with a 2-wire auto-start' },
      { fr: 'FR-9', ok: true, text: 'Nothing exported to BC Hydro',
        detail: 'Surplus solar is switched off: ' + U.kwh(T.curtailed) + ' a year' },
      { fr: 'FR-10', ok: true, text: 'Generator use kept low',
        detail: U.kwh(T.gen) + ' a year over ' + T.genStarts + ' starts, ' + U.money(T.genCost) + ' in year 1' }
    ];
  }

  return { build: build, days: days };
})();
