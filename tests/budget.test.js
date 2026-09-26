/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage Test Suite — tests/budget.test.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Validates the Victoria budget: City permit fee formulas, BC PST/GST rules,
 * challenge unit prices, lifecycle NPV and the optimizer's cost consistency.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/* global TestRunner, SunEngine, SunBudget, SunSettings */

function budgetDesign(overrides) {
  return SunEngine.buildDesign(Object.assign(SunSettings.defaults(), overrides || {}));
}

TestRunner.suite('City of Victoria permit fees', function () {
  TestRunner.test('electrical permit — low tiers', function (assert) {
    assert.equal(SunBudget.victoriaElectricalPermit(250), 36, '$1–$300');
    assert.equal(SunBudget.victoriaElectricalPermit(500), 43, '$301–$500');
    assert.equal(SunBudget.victoriaElectricalPermit(1000), 61, '$701–$1,000');
  });

  TestRunner.test('electrical permit — $61 + $20 per $1,000 up to $20k', function (assert) {
    assert.equal(SunBudget.victoriaElectricalPermit(15000), 61 + 20 * 14, '$15,000 of work');
  });

  TestRunner.test('electrical permit — $441 + 1.25 % over $20k', function (assert) {
    assert.approxEqual(SunBudget.victoriaElectricalPermit(100000), 441 + 1000, 1e-9, '$100,000 of work');
  });

  TestRunner.test('building permit — $100 + 1.40 %', function (assert) {
    assert.approxEqual(SunBudget.victoriaBuildingPermit(10000), 240, 1e-9, '$10,000 construction');
    assert.equal(SunBudget.victoriaBuildingPermit(0), 0, 'no ground mount → no permit');
  });
});

TestRunner.suite('Capital budget', function () {
  TestRunner.test('challenge unit prices are used', function (assert) {
    var cap = SunBudget.capex(budgetDesign());
    var find = function (re) { return cap.lines.filter(function (l) { return re.test(l.item); })[0]; };
    assert.equal(find(/JAM54D41/).unitCost, 350, 'panel + racking');
    assert.equal(find(/FlexBOSS21/).unitCost, 5500, 'FlexBOSS21');
    assert.equal(find(/GridBOSS microgrid/).unitCost, 2500, 'GridBOSS');
    assert.equal(find(/280Ah/).unitCost, 5500, 'battery');
    assert.equal(find(/200 A electrical panel/).unitCost, 1500, '200 A panel');
  });

  TestRunner.test('equipment subtotal matches hand calculation', function (assert) {
    var d = budgetDesign();
    var cap = SunBudget.capex(d);
    var expected = d.panels * 350 + d.inverters * 5500 + d.gridboss * 2500 + d.batteries * 5500 + 2 * 1500;
    assert.approxEqual(cap.byCategory.Equipment, expected, 1e-9, 'equipment');
  });

  TestRunner.test('PST: panels exempt, batteries taxable (PST Bulletin 203)', function (assert) {
    var cap = SunBudget.capex(budgetDesign());
    var panel = cap.lines.filter(function (l) { return /JAM54D41/.test(l.item); })[0];
    var bat = cap.lines.filter(function (l) { return /280Ah/.test(l.item); })[0];
    var inv = cap.lines.filter(function (l) { return /FlexBOSS21/.test(l.item); })[0];
    assert.isFalse(panel.pst, 'PV panels exempt');
    assert.isFalse(inv.pst, 'inverters exempt');
    assert.isTrue(bat.pst, 'batteries taxable');
  });

  TestRunner.test('one more battery adds PST on battery + interconnect', function (assert) {
    var a = SunBudget.capex(budgetDesign({ batteries: 6 }));
    var b = SunBudget.capex(budgetDesign({ batteries: 7 }));
    assert.approxEqual(b.pstBase - a.pstBase, 5500 + 120, 1e-6, 'taxable base grows by battery + cables');
  });

  TestRunner.test('GST excludes government permit fees', function (assert) {
    var cap = SunBudget.capex(budgetDesign());
    var permit = cap.lines.filter(function (l) { return /electrical permit/.test(l.item); })[0];
    assert.isFalse(permit.gst, 'no GST on permit');
    assert.approxEqual(cap.gst, cap.gstBase * 0.05, 1e-9, 'GST 5 %');
    assert.approxEqual(cap.pst, cap.pstBase * 0.07, 1e-9, 'PST 7 %');
  });

  TestRunner.test('total = subtotal + PST + GST', function (assert) {
    var cap = SunBudget.capex(budgetDesign());
    assert.approxEqual(cap.total, cap.subtotal + cap.pst + cap.gst, 1e-6, 'totals add up');
  });

  TestRunner.test('roof share drives rapid shutdown vs building permit', function (assert) {
    var roof = SunBudget.capex(budgetDesign({ roofSharePct: 100 }));
    var ground = SunBudget.capex(budgetDesign({ roofSharePct: 0 }));
    var has = function (cap, re) { return cap.lines.some(function (l) { return re.test(l.item); }); };
    assert.isTrue(has(roof, /rapid shutdown/), 'roof → RSD');
    assert.isFalse(has(roof, /building permit/), 'roof → no building permit');
    assert.isTrue(has(ground, /building permit/), 'ground → building permit');
    assert.isFalse(has(ground, /rapid shutdown/), 'ground → no RSD');
  });
});

TestRunner.suite('Lifecycle & context', function () {
  TestRunner.test('zero discount: NPV equals nominal', function (assert) {
    var d = budgetDesign({ discountPct: 0 });
    var lc = SunBudget.lifecycle(d, 500);
    assert.approxEqual(lc.npvOpex, lc.nominalOpex, 1e-6, 'no discounting');
  });

  TestRunner.test('battery replacement appears in its year only', function (assert) {
    var d = budgetDesign({ batteryReplaceYear: 16 });
    var lc = SunBudget.lifecycle(d, 500);
    var years = lc.years.filter(function (y) { return y.batteries > 0; }).map(function (y) { return y.year; });
    assert.equal(years.join(), '16', 'year 16');
  });

  TestRunner.test('BC Hydro bill: 1,000 kWh/month', function (assert) {
    var monthly = 675 * 0.1097 + 325 * 0.1408 + 6.17;
    assert.approxEqual(SunBudget.bcHydroAnnual(12000), monthly * 12 * 1.05, 1e-6, 'inclining block + GST');
  });

  TestRunner.test('optimizer and budget agree on the 25-year cost of a design', function (assert) {
    var s = SunSettings.defaults();
    var row = SunEngine.evaluate(s, SunBudget.costFn, 92, 5);
    var d = SunEngine.buildDesign(s, { panels: 92, batteries: 5, inverters: 0 });
    var lc = SunBudget.lifecycle(d, SunEngine.lifecycleEnergy(d));
    assert.approxEqual(row.lifecycle, lc.lifecycle, 1e-6, 'same lifecycle cost, PV ageing included');
  });

  TestRunner.test('optimizer returns a feasible, cost-consistent best design', function (assert) {
    var s = Object.assign(SunSettings.defaults(), { maxPanels: 100 });
    var o = SunEngine.optimize(s, SunBudget.costFn, { panelStep: 8, batteryMax: 9 });
    assert.exists(o.best, 'a feasible design exists');
    var d = SunEngine.buildDesign(s, { panels: o.best.panels, batteries: o.best.batteries, inverters: 0 });
    assert.approxEqual(SunBudget.capex(d).total, o.best.capex, 1e-6, 'same capex as budget');
    var others = o.rows.filter(function (r) { return r.feasible; });
    assert.isTrue(others.every(function (r) { return r.lifecycle >= o.best.lifecycle; }), 'best is minimal');
  });
});

TestRunner.suite('Budget-sensitive settings', function () {
  function projectedBudget(overrides) {
    var d = budgetDesign(overrides);
    var sim = SunEngine.simulateSteadyYear(d);
    var cap = SunBudget.capex(d);
    return { cap: cap, life: SunBudget.lifecycle(d, SunEngine.lifecycleEnergy(d, sim.totals.gen), cap), sim: sim };
  }

  TestRunner.test('generator fuel, service and replacement settings reach the 25-year total', function (assert) {
    var base = projectedBudget();
    var fuel = projectedBudget({ genCostPerKwh: 3.00 });
    var carbon = projectedBudget({ genCarbonPricePerKwh: 0.20 });
    var service = projectedBudget({ genServiceCost: 700 });
    var threshold = projectedBudget({ genReplaceAtEff: 0.90 });
    var replacement = projectedBudget({ genReplaceCost: 9000 });
    var batteryRule = projectedBudget({ genStrategy: 'soc' });

    assert.approxEqual(fuel.cap.total, base.cap.total, 1e-6, 'fuel does not change installed cost');
    assert.isTrue(fuel.life.lifecycle > base.life.lifecycle, 'higher fuel cost increases lifecycle cost');
    assert.isTrue(carbon.life.lifecycle > base.life.lifecycle, 'carbon-price add-on increases lifecycle cost');
    assert.isTrue(service.life.lifecycle > base.life.lifecycle, 'higher service cost increases lifecycle cost');
    assert.isTrue(threshold.life.lifecycle > base.life.lifecycle, 'earlier generator replacement increases lifecycle cost');
    assert.isTrue(replacement.life.lifecycle > base.life.lifecycle, 'higher replacement price increases lifecycle cost');
    assert.isTrue(batteryRule.sim.totals.gen > base.sim.totals.gen, 'battery-level rule changes dispatch');
    assert.isTrue(batteryRule.life.lifecycle > base.life.lifecycle, 'dispatch rule changes lifecycle cost');
  });

  TestRunner.test('installed-cost and lifecycle controls reach their respective totals', function (assert) {
    var base = projectedBudget();
    var labour = projectedBudget({ electricianRate: 200, installerRate: 150 });
    var allowances = projectedBudget({ overheadPct: 30, contingencyPct: 25, freightPct: 10 });
    var future = projectedBudget({ horizonYears: 30, discountPct: 0, escalationPct: 6, omPerYear: 1500 });

    assert.isTrue(labour.cap.total > base.cap.total, 'labour rates increase installed cost');
    assert.isTrue(allowances.cap.total > base.cap.total, 'overhead, contingency and freight increase installed cost');
    assert.isTrue(future.life.lifecycle > base.life.lifecycle, 'horizon, discount, escalation and upkeep increase lifecycle cost');
    assert.isTrue(base.life.years.every(function (y) { return y.utility === 0; }), 'off-grid design has no standby-utility cost');
  });
});

TestRunner.suite('Settings', function () {
  TestRunner.test('defaults cover every schema key', function (assert) {
    var d = SunSettings.defaults();
    assert.isTrue(SunSettings.SCHEMA.every(function (f) { return d[f.key] !== undefined; }), 'all keys');
  });

  TestRunner.test('sanitize clamps ranges and rejects unknown choices', function (assert) {
    assert.equal(SunSettings.sanitize('panels', 9999), 160, 'clamped to max');
    assert.equal(SunSettings.sanitize('panels', 'abc'), 92, 'NaN → default');
    assert.equal(SunSettings.sanitize('genStrategy', 'nope'), 'smart', 'unknown → default');
    assert.equal(SunSettings.sanitize('serviceA', '200'), 200, 'string → option value');
  });

  TestRunner.test('challenge defaults', function (assert) {
    var d = SunSettings.defaults();
    assert.equal(d.springBaseKwh, 30, '30 kWh/day');
    assert.equal(d.autonomyDays, 3, 'three days');
    assert.equal(d.genCostPerKwh, 1.65, '$1.65/kWh');
    assert.equal(d.genCarbonPricePerKwh, 0, 'no current consumer carbon charge');
    assert.equal(d.genServiceCost, 300, '$300/service');
  });
});

TestRunner.suite('Design search over several weather years', function () {
  TestRunner.test('evaluateYears averages the years and keeps the worst', function (assert) {
    var s = SunSettings.defaults(), seeds = [1, 2, 3];
    var one = seeds.map(function (seed) {
      return SunEngine.evaluate(Object.assign({}, s, { weatherMode: 'variable', weatherSeed: seed }), SunBudget.costFn, 92, 5);
    });
    var r = SunEngine.evaluateYears(s, SunBudget.costFn, 92, 5, seeds);
    var mean = one.reduce(function (a, x) { return a + x.lifecycle; }, 0) / 3;
    assert.approxEqual(r.lifecycle, mean, 1e-6, 'lifecycle is the average of the years');
    assert.approxEqual(r.worstLifecycle, Math.max.apply(null, one.map(function (x) { return x.lifecycle; })), 1e-6, 'worst year kept');
    assert.equal(r.capex, one[0].capex, 'installed cost does not depend on the weather');
    assert.equal(r.feasible, one.every(function (x) { return x.feasible; }), 'feasible only if every year is');
    assert.equal(r.years, 3, 'three years');
  });
});
