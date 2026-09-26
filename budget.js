/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage Budget — budget.js
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Line-item capital budget and lifecycle cost for Victoria, BC.
 *
 *   Equipment   challenge unit prices (panels include racking)
 *   BOS         rapid shutdown, wiring, disconnects, generator start kit …
 *   Labour      hours × Victoria billed rates, plus contractor overhead
 *   Soft costs  City of Victoria electrical/building permits (actual fee
 *               formulas), design, engineering, freight, access
 *   Tax         GST 5 % on goods and services; PST 7 % only on goods that are
 *               not exempt under BC PST Bulletin 203 (PV panels, inverters,
 *               wiring and controllers bought as part of a PV system are
 *               exempt; batteries and general electrical gear are not)
 *   Lifecycle   generator (with service + degradation), O&M, standby utility
 *               charge, inverter & battery replacement, discounted to NPV
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./data.js'), require('./engine.js'));
  } else {
    root.SunBudget = factory(root.SunData, root.SunEngine);
  }
}(typeof window !== 'undefined' ? window : this, function (D, E) {
  'use strict';

  var EQ = D.EQUIPMENT;
  var VIC = D.VICTORIA;

  // Labour productivity assumptions (hours).
  var HOURS = {
    panelMount: 1.0,        // installer-hours per module (racking + module)
    panelElectrical: 0.3,   // electrician-hours per module (strings, RSD, homeruns)
    inverter: 10,
    gridboss: 12,
    battery: 2.5,
    serviceRework400: 40,   // disconnect, splitter, 2 × 200 A panels, circuit moves
    serviceRework200: 24,
    generator: 6,
    commissioning: 12       // settings, CT checks, automation programming, handover
  };

  /** City of Victoria contractor electrical permit fee for a work value. */
  function victoriaElectricalPermit(workValue) {
    var P = VIC.electricalPermit;
    if (workValue <= 0) return 0;
    for (var i = 0; i < P.tiers.length; i++) {
      if (workValue <= P.tiers[i].upTo) return P.tiers[i].fee;
    }
    if (workValue <= 20000) return P.midBase + P.midPerThousand * Math.ceil((workValue - 1000) / 1000);
    return P.highBase + P.highPct * (workValue - 20000);
  }

  /** City of Victoria building permit (application + 1.40 % of construction). */
  function victoriaBuildingPermit(constructionValue) {
    if (constructionValue <= 0) return 0;
    return VIC.buildingPermit.applicationFee + VIC.buildingPermit.pct * constructionValue;
  }

  function line(cat, item, qty, unit, unitCost, opts) {
    opts = opts || {};
    return {
      category: cat,
      item: item,
      qty: qty,
      unit: unit,
      unitCost: unitCost,
      total: qty * unitCost,
      pst: !!opts.pst,          // PST-taxable good
      gst: opts.gst !== false,  // GST applies unless a government fee
      note: opts.note || ''
    };
  }

  /**
   * Full capital budget for a design. Returns every line plus subtotals.
   */
  function capex(d) {
    var lines = [];
    var roofPanels = Math.round(d.panels * d.roofSharePct / 100);
    var groundPanels = d.panels - roofPanels;
    var panels200 = Math.ceil(d.serviceA / 200);
    var strings = d.layout ? d.layout.count : Math.ceil(d.panels / 12);

    // ── Equipment (challenge pricing) ────────────────────────────────────
    var EQP = 'Equipment';
    lines.push(line(EQP, EQ.panel.model + ' + racking', d.panels, 'ea', EQ.panel.unitPrice, { note: 'PST-exempt: PV panels (PST 203)' }));
    lines.push(line(EQP, EQ.inverter.model + ' hybrid inverter', d.inverters, 'ea', EQ.inverter.unitPrice, { note: 'PST-exempt: DC→AC device in a PV system' }));
    lines.push(line(EQP, EQ.gridboss.model + ' microgrid interconnect', d.gridboss, 'ea', EQ.gridboss.unitPrice, { note: 'Treated as PV-system controller (PST-exempt) — confirm with supplier' }));
    lines.push(line(EQP, EQ.battery.model, d.batteries, 'ea', EQ.battery.unitPrice, { pst: true, note: 'Batteries are not PST-exempt (PST 203)' }));
    lines.push(line(EQP, EQ.fusedDisconnect.model, 1, 'ea', EQ.fusedDisconnect.unitPrice, { pst: true }));
    lines.push(line(EQP, EQ.splitter.model, 1, 'ea', EQ.splitter.unitPrice, { pst: true }));
    lines.push(line(EQP, EQ.panel200.model, panels200, 'ea', EQ.panel200.unitPrice, { pst: true, note: 'One per GridBOSS / 200 A leg' }));
    lines.push(line(EQP, 'BE7500ID generator (existing, reused)', 1, 'ea', 0, { note: 'Moves to GridBOSS GEN port; manual transfer switch retired' }));

    // ── Balance of system (estimates) ────────────────────────────────────
    var BOS = 'Balance of system';
    if (roofPanels > 0) {
      lines.push(line(BOS, 'Module-level rapid shutdown receivers (CEC 64-218)', roofPanels, 'ea', 65, { note: 'Roof-mounted modules only' }));
    }
    lines.push(line(BOS, 'PV wire, MC4, conduit per string', strings, 'string', 180));
    lines.push(line(BOS, 'PV DC disconnect / breakers', d.inverters, 'ea', 300));
    lines.push(line(BOS, 'Inverter AC + battery cabling kit', d.inverters, 'ea', 650));
    lines.push(line(BOS, 'Battery busbar / interconnect cables', d.batteries, 'ea', 120, { pst: true }));
    lines.push(line(BOS, 'Generator interconnect (inlet, 40 A breaker, cable)', 1, 'lot', 450, { pst: true }));
    lines.push(line(BOS, 'Generator 2-wire auto-start kit', 1, 'ea', 350, { pst: true, note: 'Lets the GridBOSS start/stop the generator' }));
    lines.push(line(BOS, 'Grounding, bonding, conduit & fittings', 1, 'lot', 900 + 10 * d.panels, { pst: true }));
    if (groundPanels > 0) {
      lines.push(line(BOS, 'Ground-mount footings (per module)', groundPanels, 'ea', 60, { pst: true }));
      lines.push(line(BOS, 'Trenching & DC feeder to house', 1, 'lot', 1500, { pst: true }));
    }

    // ── Labour ──────────────────────────────────────────────────────────
    var LAB = 'Labour';
    var eRate = d.electricianRate, iRate = d.installerRate;
    lines.push(line(LAB, 'Module & racking installation', d.panels * HOURS.panelMount, 'h', iRate));
    lines.push(line(LAB, 'PV electrical (strings, RSD, homeruns)', d.panels * HOURS.panelElectrical, 'h', eRate));
    lines.push(line(LAB, 'Inverter installation', d.inverters * HOURS.inverter, 'h', eRate));
    lines.push(line(LAB, 'GridBOSS installation', d.gridboss * HOURS.gridboss, 'h', eRate));
    lines.push(line(LAB, 'Battery installation', d.batteries * HOURS.battery, 'h', eRate));
    lines.push(line(LAB, 'Service rework (disconnect, splitter, panels)',
      d.serviceA > 200 ? HOURS.serviceRework400 : HOURS.serviceRework200, 'h', eRate));
    lines.push(line(LAB, 'Generator integration', HOURS.generator, 'h', eRate));
    lines.push(line(LAB, 'Commissioning & automation programming', HOURS.commissioning, 'h', eRate));

    var sum = function (cat) {
      return lines.filter(function (l) { return l.category === cat; })
                  .reduce(function (a, l) { return a + l.total; }, 0);
    };
    var equipment = sum(EQP), bos = sum(BOS), labour = sum(LAB);
    lines.push(line(LAB, 'Contractor overhead & profit', 1, 'lot', (bos + labour) * d.overheadPct / 100,
      { note: d.overheadPct + ' % of BOS + labour' }));

    // ── Soft costs ──────────────────────────────────────────────────────
    var SOFT = 'Soft costs';
    var workValue = equipment + bos + labour;
    lines.push(line(SOFT, 'Electrical design, single-line diagram & load calc', 1, 'lot', 1800));
    if (roofPanels > 0) {
      lines.push(line(SOFT, 'Structural engineer roof-load letter', 1, 'lot', 1200));
      lines.push(line(SOFT, 'Scaffolding & fall protection (WorkSafeBC)', 1, 'lot', 1500));
    }
    lines.push(line(SOFT, 'City of Victoria electrical permit', 1, 'permit', victoriaElectricalPermit(workValue),
      { gst: false, note: '$441 + 1.25 % of work value over $20k' }));
    if (groundPanels > 0) {
      var groundConstruction = groundPanels * (EQ.panel.unitPrice + 60) + 1500;
      lines.push(line(SOFT, 'City of Victoria building permit (ground mount)', 1, 'permit',
        victoriaBuildingPermit(groundConstruction), { gst: false, note: '$100 + 1.40 % of construction value' }));
    }
    lines.push(line(SOFT, 'Freight to Vancouver Island', 1, 'lot', equipment * d.freightPct / 100));
    lines.push(line(SOFT, 'Waste & packaging disposal', 1, 'lot', 350));

    var pretax = lines.reduce(function (a, l) { return a + l.total; }, 0);
    var contingency = pretax * d.contingencyPct / 100;
    lines.push(line('Contingency', 'Design & construction contingency', 1, 'lot', contingency,
      { note: d.contingencyPct + ' % of pre-tax subtotal' }));

    var pstBase = lines.filter(function (l) { return l.pst; }).reduce(function (a, l) { return a + l.total; }, 0);
    var gstBase = lines.filter(function (l) { return l.gst; }).reduce(function (a, l) { return a + l.total; }, 0);
    var pst = pstBase * VIC.pstPct / 100;
    var gst = gstBase * VIC.gstPct / 100;
    var subtotal = pretax + contingency;

    var byCategory = {};
    lines.forEach(function (l) { byCategory[l.category] = (byCategory[l.category] || 0) + l.total; });

    return {
      lines: lines,
      byCategory: byCategory,
      equipment: equipment,
      subtotal: subtotal,
      pstBase: pstBase,
      gstBase: gstBase,
      pst: pst,
      gst: gst,
      total: subtotal + pst + gst,
      workValue: workValue,
      roofPanels: roofPanels,
      groundPanels: groundPanels
    };
  }

  /** Taxed replacement cost of `qty` units (price + install hours). */
  function replacementCost(unitPrice, qty, hoursEach, rate, pstTaxable) {
    var goods = unitPrice * qty;
    var labour = hoursEach * qty * rate;
    var tax = goods * ((pstTaxable ? VIC.pstPct : 0) + VIC.gstPct) / 100 + labour * VIC.gstPct / 100;
    return goods + labour + tax;
  }

  /** Annual BC Hydro bill for a given annual kWh (inclining block, + GST). */
  function bcHydroAnnual(annualKwh, basicOnly) {
    var H = VIC.bcHydro;
    var perMonth = annualKwh / 12;
    var energy = basicOnly ? 0 :
      Math.min(perMonth, H.step1KwhPerMonth) * H.step1PerKwh +
      Math.max(0, perMonth - H.step1KwhPerMonth) * H.step2PerKwh;
    return (energy + H.basicChargePerMonth) * 12 * (1 + VIC.gstPct / 100);
  }

  /**
   * Year-by-year operating costs and NPV.
   * `genKwh` is either one number (repeated every year) or an array by year.
   */
  function lifecycle(d, genKwh, cap) {
    cap = cap || capex(d);
    var n = d.horizonYears;
    var kwh = Array.isArray(genKwh) ? genKwh : Array.apply(null, Array(n)).map(function () { return genKwh; });
    var gen = E.generatorCostByYear(kwh, d);
    var r = d.discountPct / 100;
    var years = [];
    var npvOpex = 0;
    for (var y = 0; y < n; y++) {
      var esc = Math.pow(1 + d.escalationPct / 100, y);
      var row = {
        year: y + 1,
        genKwh: kwh[y],
        generator: gen[y].cost,
        genServices: gen[y].services,
        genReplacements: gen[y].replacements,
        om: d.omPerYear * esc,
        utility: d.keepUtility ? bcHydroAnnual(0, true) * esc : 0,
        inverters: y + 1 === d.inverterReplaceYear ?
          replacementCost(EQ.inverter.unitPrice, d.inverters, HOURS.inverter, d.electricianRate, false) * esc : 0,
        batteries: y + 1 === d.batteryReplaceYear ?
          replacementCost(EQ.battery.unitPrice, d.batteries, HOURS.battery, d.electricianRate, true) * esc : 0
      };
      row.total = row.generator + row.om + row.utility + row.inverters + row.batteries;
      row.discounted = row.total / Math.pow(1 + r, y + 1);
      npvOpex += row.discounted;
      years.push(row);
    }
    return {
      years: years,
      capex: cap.total,
      npvOpex: npvOpex,
      lifecycle: cap.total + npvOpex,
      annualOpex: years[0].total,
      nominalOpex: years.reduce(function (a, y) { return a + y.total; }, 0)
    };
  }

  /** Cost function handed to the optimizer. */
  function costFn(d, genKwhPerYear) {
    var cap = capex(d);
    var lc = lifecycle(d, genKwhPerYear, cap);
    return { capex: cap.total, lifecycle: lc.lifecycle, annualOpex: lc.annualOpex };
  }

  return Object.freeze({
    HOURS: HOURS,
    victoriaElectricalPermit: victoriaElectricalPermit,
    victoriaBuildingPermit: victoriaBuildingPermit,
    capex: capex,
    lifecycle: lifecycle,
    replacementCost: replacementCost,
    bcHydroAnnual: bcHydroAnnual,
    costFn: costFn
  });
}));
