/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage Test Suite — tests/engine.test.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Validates the energy engine against the challenge package and datasheets:
 *   - load / solar profiles and seasonal factors
 *   - Voc,max string sizing formula and FlexBOSS21 MPPT limits
 *   - component minimum rules (GridBOSS, 600 Ah per inverter, 21 kW PV)
 *   - weather generator, dispatch energy conservation, SOC bounds
 *   - generator service / degradation accounting
 *   - autonomy test and dispatch strategy comparison
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/* global TestRunner, SunData, SunEngine, SunSettings */

function defaultDesign(overrides) {
  var s = Object.assign(SunSettings.defaults(), overrides || {});
  return SunEngine.buildDesign(s);
}

TestRunner.suite('Challenge profiles & seasons', function () {
  TestRunner.test('spring hourly load sums to 30 kWh', function (assert) {
    var sum = SunData.SPRING_HOURLY_KWH.reduce(function (a, b) { return a + b; }, 0);
    assert.approxEqual(sum, 30, 1e-9, 'bell curve should total the 30 kWh/day baseline');
  });

  TestRunner.test('solar hourly shape sums to 100 %', function (assert) {
    var sum = SunEngine.SOLAR_SHAPE.reduce(function (a, b) { return a + b; }, 0);
    assert.approxEqual(sum, 1, 1e-9, 'solar shape fractions should sum to 1');
  });

  TestRunner.test('seasonal daily loads match challenge factors', function (assert) {
    var f = function (id) { return SunEngine.seasonalDailyLoad(SunEngine.seasonById(id), 30); };
    assert.approxEqual(f('winter'), 39.0, 1e-9, 'winter = +30 %');
    assert.approxEqual(f('spring'), 30.0, 1e-9, 'spring = baseline');
    assert.approxEqual(f('summer'), 25.5, 1e-9, 'summer = −15 %');
    assert.approxEqual(f('fall'), 34.5, 1e-9, 'fall = +15 %');
  });

  TestRunner.test('every day of the year maps to a season with challenge PSH', function (assert) {
    var psh = { winter: 1.17, spring: 4.25, summer: 6.02, fall: 2.41 };
    var ok = true;
    for (var d = 0; d < 365; d++) {
      var s = SunEngine.seasonOfDay(d);
      if (!s || s.psh !== psh[s.id]) ok = false;
    }
    assert.isTrue(ok, 'all 365 days resolve to a season');
    assert.equal(SunEngine.seasonOfDay(0).id, 'winter', '1 Jan is winter');
    assert.equal(SunEngine.seasonOfDay(180).id, 'summer', 'end of June is summer');
  });
});

TestRunner.suite('PV string sizing (challenge Voc,max formula)', function () {
  TestRunner.test('Voc,max = Voc × (1 + (Tmin − 25) × −0.250/100)', function (assert) {
    // −16 °C: ΔT = −41 → +10.25 % → 38.9 × 1.1025 = 42.887 V
    assert.approxEqual(SunEngine.vocMax(38.9, -16, -0.25), 42.887, 0.001, 'Victoria design low');
    // 25 °C → no change
    assert.approxEqual(SunEngine.vocMax(38.9, 25, -0.25), 38.9, 1e-9, 'STC gives nameplate Voc');
  });

  TestRunner.test('Victoria strings: 9–12 modules, cold Voc < 550 V', function (assert) {
    var sd = SunEngine.stringDesign(-16, 65);
    assert.equal(sd.maxSeries, 12, '⌊550 / 42.89⌋ = 12');
    assert.equal(sd.minSeries, 9, 'hot Vmp must stay ≥ 250 V');
    assert.isTrue(sd.stringVocColdV < 550, 'string Voc under MPPT protection');
    assert.isTrue(sd.stringVocColdV < 600, 'string Voc under absolute max');
    assert.isTrue(sd.ok, 'string design valid');
  });

  TestRunner.test('two strings per 26 A MPPT, one on the 15 A MPPT', function (assert) {
    var sd = SunEngine.stringDesign(-16, 65);
    assert.equal(sd.stringsPerMppt.join(','), '2,2,1', '2 × 14.3 A ≤ 31 A; 1 × 14.3 A ≤ 19 A');
    assert.equal(sd.maxPanelsPerInverter, 47, '21 kW / 440 W = 47 modules');
  });

  TestRunner.test('colder design temperature shortens strings', function (assert) {
    assert.isTrue(SunEngine.stringDesign(-30, 65).maxSeries < SunEngine.stringDesign(0, 65).maxSeries,
      'more cold → higher Voc → fewer modules');
  });

  TestRunner.test('92 panels on 2 inverters → 8 strings of 11–12', function (assert) {
    var sd = SunEngine.stringDesign(-16, 65);
    var lay = SunEngine.stringLayout(92, 2, sd);
    assert.equal(lay.count, 8, 'eight strings');
    assert.equal(lay.strings.reduce(function (a, b) { return a + b; }, 0), 92, 'all modules placed');
    assert.isTrue(lay.ok, 'layout within limits');
  });
});

TestRunner.suite('Component minimum rules', function () {
  TestRunner.test('400 A service → 2 GridBOSS and ≥ 2 inverters', function (assert) {
    var d = defaultDesign({ panels: 30, inverters: 1, batteries: 1 });
    assert.equal(d.gridboss, 2, '400 A / 200 A');
    assert.isTrue(d.inverters >= 2, 'one inverter per GridBOSS');
  });

  TestRunner.test('battery bank ≥ 600 Ah per inverter', function (assert) {
    var d = defaultDesign({ panels: 30, inverters: 2, batteries: 1 });
    assert.isTrue(d.batteries * 280 >= d.inverters * 600, 'EG4 minimum capacity per FlexBOSS21');
    assert.equal(d.batteries, 5, '1,200 Ah / 280 Ah → 5');
  });

  TestRunner.test('PV above 2 × 21 kW forces a third inverter', function (assert) {
    var d = defaultDesign({ panels: 100 });
    assert.equal(d.inverters, 3, '44 kW needs 3 inverters');
    assert.isTrue(d.pvKw <= d.inverters * 21, 'PV within recommended max');
  });

  TestRunner.test('design peak drives inverter count', function (assert) {
    var d = defaultDesign({ panels: 30, designPeakKw: 30 });
    assert.equal(d.inverters, 3, '30 kW / 12 kW battery-only = 3');
  });

  TestRunner.test('200 A service needs only one GridBOSS', function (assert) {
    var d = defaultDesign({ panels: 30, serviceA: 200, designPeakKw: 10, inverters: 1 });
    assert.equal(d.gridboss, 1, 'one GridBOSS');
  });
});

TestRunner.suite('Weather', function () {
  TestRunner.test('average mode reproduces challenge PSH exactly', function (assert) {
    var psh = SunEngine.dailyPsh('average', 1);
    assert.equal(psh[10], 1.17, 'January');
    assert.equal(psh[190], 6.02, 'July');
  });

  TestRunner.test('variable mode keeps each seasonal mean', function (assert) {
    var psh = SunEngine.dailyPsh('variable', 3);
    SunData.SEASONS.forEach(function (s) {
      var sum = 0, n = 0;
      for (var d = 0; d < 365; d++) if (SunEngine.seasonOfDay(d).id === s.id) { sum += psh[d]; n++; }
      assert.approxEqual(sum / n, s.psh, 0.02, s.name + ' mean PSH preserved');
    });
  });

  TestRunner.test('variable mode is reproducible and seed-dependent', function (assert) {
    var a = SunEngine.dailyPsh('variable', 5), b = SunEngine.dailyPsh('variable', 5), c = SunEngine.dailyPsh('variable', 6);
    assert.equal(a.join(), b.join(), 'same seed → same weather');
    assert.isTrue(a.join() !== c.join(), 'different seed → different weather');
    assert.isTrue(Math.min.apply(null, a) >= 0, 'no negative sun');
  });
});

TestRunner.suite('Dispatch physics', function () {
  TestRunner.test('stepNoGen conserves PV energy', function (assert) {
    var d = defaultDesign();
    var L = SunEngine.limits(d);
    var r = SunEngine.stepNoGen(L.cap * 0.5, 2, 10, L);
    var accounted = r.direct / 0.97 + r.pvToBattery / 0.945 + r.curtailed;
    assert.approxEqual(accounted, 10, 1e-9, 'PV DC = direct + to battery + curtailed');
    assert.approxEqual(r.direct, 2, 1e-9, 'load fully met from PV');
  });

  TestRunner.test('battery never leaves its SOC window', function (assert) {
    var d = defaultDesign();
    var sim = SunEngine.simulateSteadyYear(d, { keepHourly: true });
    var lo = Math.min.apply(null, sim.hourly.soc), hi = Math.max.apply(null, sim.hourly.soc);
    assert.isTrue(lo >= d.minSocPct / 100 - 1e-9, 'never below floor (' + lo + ')');
    assert.isTrue(hi <= 1 + 1e-9, 'never above 100 %');
  });

  TestRunner.test('annual load balance closes', function (assert) {
    var d = defaultDesign();
    var T = SunEngine.simulateSteadyYear(d).totals;
    assert.approxEqual(T.direct + T.discharge + T.genToLoad + T.unserved, T.load, 1e-6,
      'load = solar direct + battery + generator + unserved');
  });

  TestRunner.test('default design serves every hour', function (assert) {
    var T = SunEngine.simulateSteadyYear(defaultDesign()).totals;
    assert.isTrue(T.unserved < 0.01, 'no unserved energy');
    assert.isTrue(T.gen > 0, 'winter still needs some generator');
  });

  TestRunner.test('huge array needs no generator in average weather', function (assert) {
    var d = defaultDesign({ panels: 160, batteries: 24, weatherMode: 'average' });
    var T = SunEngine.simulateSteadyYear(d).totals;
    assert.approxEqual(T.gen, 0, 1e-9, 'no generator hours');
  });

  TestRunner.test('no export: surplus is curtailed, never negative', function (assert) {
    var T = SunEngine.simulateSteadyYear(defaultDesign()).totals;
    assert.isTrue(T.curtailed > 0, 'summer surplus is curtailed');
  });

  TestRunner.test('inverter idle draw adds 65 W × 24 h per inverter', function (assert) {
    var a = SunEngine.simulateSteadyYear(defaultDesign({ includeIdle: false, heaterHoursWinter: 0 })).totals.load;
    var b = SunEngine.simulateSteadyYear(defaultDesign({ includeIdle: true, heaterHoursWinter: 0 })).totals.load;
    assert.approxEqual(b - a, 2 * 0.065 * 8760, 1e-6, 'two inverters idle all year');
  });
});

TestRunner.suite('Generator accounting', function () {
  var s = { genCostPerKwh: 1.65, genServiceCost: 300, genReplaceAtEff: 0.7, genReplaceCost: 3500 };

  TestRunner.test('first 100 kWh: $165 energy + $300 service', function (assert) {
    var g = SunEngine.newGenerator();
    assert.approxEqual(SunEngine.runGenerator(g, 100, s), 465, 1e-9, 'fresh generator');
    assert.equal(g.services, 1, 'one service');
    assert.approxEqual(g.efficiency, 0.98, 1e-12, '2 % efficiency loss');
  });

  TestRunner.test('after a service each kWh costs $1.65 / 0.98', function (assert) {
    var g = SunEngine.newGenerator();
    SunEngine.runGenerator(g, 100, s);
    assert.approxEqual(SunEngine.runGenerator(g, 50, s), 50 * 1.65 / 0.98, 1e-9, 'degraded efficiency');
  });

  TestRunner.test('services accumulate across calls', function (assert) {
    var g = SunEngine.newGenerator();
    SunEngine.runGenerator(g, 60, s);
    SunEngine.runGenerator(g, 60, s);
    assert.equal(g.services, 1, '120 kWh → one service');
    assert.approxEqual(g.kwhSinceService, 20, 1e-9, '20 kWh carried over');
  });

  TestRunner.test('replaced when efficiency drops below threshold', function (assert) {
    var g = SunEngine.newGenerator();
    // 0.98^18 = 0.695 < 0.70 → replacement on the 18th service
    SunEngine.runGenerator(g, 1800, s);
    assert.equal(g.replacements, 1, 'one replacement');
    assert.approxEqual(g.efficiency, 1, 1e-12, 'new generator');
  });

  TestRunner.test('lifecycle years carry service state', function (assert) {
    var rows = SunEngine.generatorCostByYear([150, 150], Object.assign({ escalationPct: 0 }, s));
    assert.equal(rows[0].services + rows[1].services, 3, '300 kWh → 3 services over two years');
  });
});

TestRunner.suite('Backup autonomy & automation', function () {
  TestRunner.test('default design meets 3-day winter backup without generator', function (assert) {
    var a = SunEngine.autonomy(defaultDesign(), 'winter', 14, true);
    assert.isTrue(a.days >= 3, 'winter autonomy ' + a.days.toFixed(1) + ' days');
  });

  TestRunner.test('zero-sun autonomy ≈ usable storage / daily load', function (assert) {
    var d = defaultDesign();
    var a = SunEngine.autonomy(d, 'winter', 14, false);
    var dailyAc = 39 + SunEngine.overheadKw(d, SunEngine.seasonById('winter')) * 24;
    var expected = d.usableKwh * 0.94 / dailyAc;
    assert.approxEqual(a.days, expected, 0.35, 'battery-only estimate');
  });

  TestRunner.test('more batteries never reduce autonomy', function (assert) {
    var a = SunEngine.autonomy(defaultDesign({ batteries: 5 }), 'winter', 14, false).days;
    var b = SunEngine.autonomy(defaultDesign({ batteries: 10 }), 'winter', 14, false).days;
    assert.isTrue(b > a, 'monotonic in storage');
  });

  TestRunner.test('forecast-aware dispatch uses less generator than SOC trigger', function (assert) {
    var smart = 0, soc = 0;
    for (var seed = 1; seed <= 5; seed++) {
      var d = defaultDesign({ weatherMode: 'variable', weatherSeed: seed });
      smart += SunEngine.simulateSteadyYear(d, { strategy: 'smart' }).totals.gen;
      soc += SunEngine.simulateSteadyYear(d, { strategy: 'soc' }).totals.gen;
    }
    assert.isTrue(smart < soc, 'smart ' + Math.round(smart) + ' kWh vs SOC ' + Math.round(soc) + ' kWh over 5 years');
  });

  TestRunner.test('minimum run time is honoured', function (assert) {
    var d = defaultDesign({ genMinRunH: 3 });
    var H = SunEngine.simulateSteadyYear(d, { keepHourly: true }).hourly.gen;
    var shortest = Infinity, run = 0;
    for (var t = 0; t < H.length; t++) {
      if (H[t] > 0) run++;
      else if (run) { shortest = Math.min(shortest, run); run = 0; }
    }
    assert.isTrue(shortest >= 3 || shortest === Infinity, 'shortest run ' + shortest + ' h');
  });
});
