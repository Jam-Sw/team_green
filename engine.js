/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage Energy Engine — engine.js
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Sizes and simulates an off-grid PV + battery + generator system for a 400 A
 * residential service in Victoria, BC, hour by hour for a full year.
 *
 *   1. String sizing      Voc,max = Voc × (1 + (Tmin − 25) × β/100)   [challenge]
 *   2. Component rules    FlexBOSS21 / GridBOSS / battery datasheet limits
 *   3. Weather            seasonal peak sun hours, optionally with day-to-day
 *                         variability (seeded AR(1) log-normal, seasonal mean kept)
 *   4. Dispatch           PV → load → battery → generator, with datasheet
 *                         conversion efficiencies and power limits
 *   5. Generator          $/kWh, service every 100 kWh, −2 % efficiency per
 *                         service, replacement below an efficiency threshold
 *   6. Autonomy           N-day whole-home backup test with no generator
 *   7. Optimizer          panels × batteries sweep on lifecycle cost
 *
 * UNITS: kW, kWh, V, A, °C, CAD. One simulation step is one hour, so kW and
 *        kWh are numerically interchangeable within a step.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./data.js'));
  } else {
    root.SunEngine = factory(root.SunData);
  }
}(typeof window !== 'undefined' ? window : this, function (D) {
  'use strict';

  var EQ = D.EQUIPMENT;
  var HOURS_PER_YEAR = 8760;
  var LOOKAHEAD_H = 36;

  // ═══════════════════════════════════════════════════════════════════════════
  // CALENDAR
  // ═══════════════════════════════════════════════════════════════════════════

  var SEASON_BY_MONTH = (function () {
    var map = [];
    D.SEASONS.forEach(function (s) {
      s.months.forEach(function (m) { map[m] = s; });
    });
    return map;
  })();

  /** Month index (0–11) for day-of-year 0–364. */
  var MONTH_OF_DAY = (function () {
    var out = [];
    D.DAYS_IN_MONTH.forEach(function (n, m) {
      for (var i = 0; i < n; i++) out.push(m);
    });
    return out;
  })();

  function seasonOfDay(day) {
    return SEASON_BY_MONTH[MONTH_OF_DAY[day]];
  }

  function seasonById(id) {
    for (var i = 0; i < D.SEASONS.length; i++) {
      if (D.SEASONS[i].id === id) return D.SEASONS[i];
    }
    throw new RangeError('Unknown season: ' + id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILES
  // ═══════════════════════════════════════════════════════════════════════════

  var SPRING_TOTAL = D.SPRING_HOURLY_KWH.reduce(function (a, b) { return a + b; }, 0);

  /** Fraction of a day's load drawn in each hour (sums to 1). */
  var LOAD_SHAPE = D.SPRING_HOURLY_KWH.map(function (v) { return v / SPRING_TOTAL; });

  /** Fraction of a day's PV production in each hour (sums to 1). */
  var SOLAR_SHAPE = D.SOLAR_HOURLY_PCT.map(function (v) { return v / 100; });

  /** Daily household load (kWh) for a season, excluding equipment overhead. */
  function seasonalDailyLoad(season, springBaseKwh) {
    return springBaseKwh * season.loadFactor;
  }

  /** Always-on equipment load (kW): inverter idle draw plus battery heaters. */
  function overheadKw(design, season) {
    var kw = 0;
    if (design.includeIdle) kw += design.inverters * EQ.inverter.idleW / 1000;
    if (season.id === 'winter' && design.heaterHoursWinter > 0) {
      kw += design.batteries * EQ.battery.heaterW / 1000 * design.heaterHoursWinter / 24;
    }
    return kw;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. PV STRING SIZING — challenge "Open-Circuit Voltage for MPPT Sizing"
  //    Voc,max = Voc × (1 + (Tmin − 25) × (−0.250) / 100)
  // ═══════════════════════════════════════════════════════════════════════════

  function vocMax(vocStc, tMinC, coeffPctPerC) {
    return vocStc * (1 + (tMinC - 25) * coeffPctPerC / 100);
  }

  /** Vmp at a cell temperature, using the Pmax coefficient as a proxy. */
  function vmpAt(tempC) {
    return EQ.panel.vmpV * (1 + (tempC - 25) * EQ.panel.tempCoeffPmaxPct / 100);
  }

  /**
   * Allowed modules-per-string for the FlexBOSS21 in Victoria's climate, plus
   * the string layout per inverter. The upper bound keeps cold-morning Voc under
   * the 550 V MPPT high-voltage protection (not just the 600 V absolute max);
   * the lower bound keeps hot-afternoon Vmp inside the 250 V full-power window.
   */
  function stringDesign(tMinC, hotCellC) {
    var P = EQ.panel, I = EQ.inverter;
    var vocCold = vocMax(P.vocV, tMinC, P.tempCoeffVocPct);
    var vmpHot = vmpAt(hotCellC);
    var vmpCold = vmpAt(tMinC);
    var maxSeries = Math.floor(I.mpptHighProtectV / vocCold);
    var minSeries = Math.ceil(I.mpptFullPowerV[0] / vmpHot);
    // Largest length whose cold Vmp still sits inside the full-power window.
    var series = Math.min(maxSeries, P.designMaxSeries || maxSeries);
    while (series > minSeries && series * vmpCold > I.mpptFullPowerV[1]) series--;

    // Parallel strings per MPPT limited by the MPPT short-circuit rating.
    var stringsPerMppt = I.mppts.map(function (m) {
      return Math.min(m.inputs, Math.floor(m.iscA / P.iscA));
    });
    var stringsPerInverter = stringsPerMppt.reduce(function (a, b) { return a + b; }, 0);
    var byStrings = stringsPerInverter * series;
    var byPower = Math.floor(I.maxPvKw * 1000 / P.pmaxW);

    return {
      vocColdV: vocCold,
      vmpHotV: vmpHot,
      vmpColdV: vmpCold,
      minSeries: minSeries,
      maxSeries: maxSeries,
      designMaxSeries: P.designMaxSeries || maxSeries,
      series: series,
      stringVocColdV: series * vocCold,
      stringVmpHotV: series * vmpHot,
      stringVmpColdV: series * vmpCold,
      stringsPerMppt: stringsPerMppt,
      stringsPerInverter: stringsPerInverter,
      maxPanelsPerInverter: Math.min(byStrings, byPower),
      ok: minSeries <= maxSeries &&
          series * vocCold < I.mpptHighProtectV &&
          series * vmpHot >= I.mpptFullPowerV[0]
    };
  }

  /** Split N panels over the inverters as strings of roughly equal length. */
  function stringLayout(panels, inverters, sd) {
    var totalStrings = Math.max(inverters, Math.ceil(panels / sd.series));
    var base = Math.floor(panels / totalStrings);
    var extra = panels % totalStrings;
    var strings = [];
    for (var i = 0; i < totalStrings; i++) strings.push(base + (i < extra ? 1 : 0));
    var perInverter = Math.ceil(totalStrings / inverters);
    var shortest = Math.min.apply(null, strings);
    return {
      strings: strings,
      count: totalStrings,
      perInverter: perInverter,
      ok: perInverter <= sd.stringsPerInverter &&
          shortest >= sd.minSeries &&
          Math.max.apply(null, strings) <= sd.maxSeries
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. COMPONENT RULES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Minimum counts that the datasheets and the 400 A service force, before any
   * energy optimisation.
   */
  function minimums(panels, s) {
    var sd = stringDesign(s.designLowC, s.designHotCellC);
    var invForLoad = Math.ceil(s.designPeakKw / EQ.inverter.batteryOnlyKw);
    var invForPv = Math.ceil(panels / sd.maxPanelsPerInverter);
    var gbForService = Math.ceil(s.serviceA / EQ.gridboss.ratedA);
    var inverters = Math.max(1, invForLoad, invForPv, gbForService);
    var gridboss = Math.max(gbForService, Math.ceil(inverters / EQ.gridboss.maxInverters));
    var batForAh = Math.ceil(inverters * EQ.inverter.minBatteryAhPerInverter / EQ.battery.capacityAh);
    // Battery-only surge: every battery supplies at most 140 A continuous.
    var batForPower = Math.ceil(s.designPeakKw * 1000 / EQ.inverter.effBatteryToLoad /
                                (EQ.battery.maxContinuousA * EQ.battery.nominalV));
    return {
      stringDesign: sd,
      inverters: inverters,
      invForLoad: invForLoad,
      invForPv: invForPv,
      gridboss: gridboss,
      gbForService: gbForService,
      batteries: Math.max(batForAh, batForPower),
      batForAh: batForAh,
      batForPower: batForPower
    };
  }

  /** Build a complete design from settings, applying the minimums. */
  function buildDesign(s, overrides) {
    var o = overrides || {};
    var panels = o.panels != null ? o.panels : s.panels;
    var min = minimums(panels, s);
    var inverters = Math.max(min.inverters, o.inverters != null ? o.inverters : (s.inverters || 0));
    var gridboss = Math.max(min.gridboss, Math.ceil(inverters / EQ.gridboss.maxInverters));
    var batteries = Math.max(min.batteries, o.batteries != null ? o.batteries : s.batteries);
    var d = Object.assign({}, s, {
      panels: panels,
      inverters: inverters,
      gridboss: gridboss,
      batteries: batteries,
      pvKw: panels * EQ.panel.pmaxW / 1000,
      batteryKwh: batteries * EQ.battery.energyKwh,
      minimums: min,
      layout: stringLayout(panels, inverters, min.stringDesign)
    });
    d.usableKwh = d.batteryKwh * (1 - s.minSocPct / 100);
    return d;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. WEATHER — daily equivalent peak sun hours
  // ═══════════════════════════════════════════════════════════════════════════

  /** Mulberry32 — small, fast, seedable PRNG so runs are reproducible. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(rand) {
    var u = 1 - rand(), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Day-to-day variability of daily insolation and clear-sky ceilings (PSH)
  // for a maritime Pacific Northwest climate. Assumptions, not challenge data.
  var VARIABILITY = {
    winter: { cv: 0.65, clearSky: 2.4 },
    spring: { cv: 0.45, clearSky: 7.0 },
    summer: { cv: 0.30, clearSky: 7.8 },
    fall:   { cv: 0.55, clearSky: 4.8 }
  };
  var WEATHER_PERSISTENCE = 0.6; // AR(1) day-to-day correlation → multi-day storms

  /**
   * 365 daily PSH values. 'average' reproduces the challenge's seasonal means
   * exactly; 'variable' draws correlated cloudy/sunny spells whose seasonal
   * mean still equals the challenge value.
   */
  function dailyPsh(mode, seed) {
    var out = new Array(365);
    var d;
    if (mode !== 'variable') {
      for (d = 0; d < 365; d++) out[d] = seasonOfDay(d).psh;
      return out;
    }
    var rand = rng(seed || 1);
    var z = 0;
    var mult = new Array(365);
    for (d = 0; d < 365; d++) {
      var v = VARIABILITY[seasonOfDay(d).id];
      var sigma = Math.sqrt(Math.log(1 + v.cv * v.cv));
      z = WEATHER_PERSISTENCE * z + Math.sqrt(1 - WEATHER_PERSISTENCE * WEATHER_PERSISTENCE) * gaussian(rand);
      mult[d] = Math.exp(sigma * z - sigma * sigma / 2);
    }
    // Rescale each season to its exact mean while respecting the clear-sky cap.
    D.SEASONS.forEach(function (s) {
      var days = [];
      for (var i = 0; i < 365; i++) if (seasonOfDay(i).id === s.id) days.push(i);
      var cap = VARIABILITY[s.id].clearSky;
      for (var iter = 0; iter < 20; iter++) {
        var sum = 0;
        days.forEach(function (i) { sum += mult[i] * s.psh; });
        var k = s.psh * days.length / sum;
        days.forEach(function (i) { mult[i] = Math.min(mult[i] * k, cap / s.psh); });
      }
      days.forEach(function (i) { out[i] = mult[i] * s.psh; });
    });
    return out;
  }

  /** Per-day multiplicative forecast error (1 = perfect forecast). */
  function forecastFactors(errorPct, seed) {
    var rand = rng((seed || 1) * 7919 + 13);
    var out = new Array(365);
    for (var d = 0; d < 365; d++) {
      out[d] = Math.max(0, 1 + gaussian(rand) * errorPct / 100);
    }
    return out;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4 & 5. HOURLY DISPATCH + GENERATOR
  // ═══════════════════════════════════════════════════════════════════════════

  /** Hourly load (AC kWh) and PV (DC kWh) series for one year. */
  function yearSeries(design, psh, pvAgeFactor) {
    var load = new Float64Array(HOURS_PER_YEAR);
    var pv = new Float64Array(HOURS_PER_YEAR);
    var pvDcPerPsh = design.pvKw * design.pvDerate * (pvAgeFactor || 1);
    for (var d = 0; d < 365; d++) {
      var season = seasonOfDay(d);
      var daily = seasonalDailyLoad(season, design.springBaseKwh);
      var over = overheadKw(design, season);
      var pvDay = pvDcPerPsh * psh[d];
      for (var h = 0; h < 24; h++) {
        var t = d * 24 + h;
        load[t] = daily * LOAD_SHAPE[h] + over;
        pv[t] = pvDay * SOLAR_SHAPE[h];
      }
    }
    return { load: load, pv: pv };
  }

  function limits(design) {
    var I = EQ.inverter, B = EQ.battery;
    var cap = design.batteryKwh;
    return {
      cap: cap,
      floor: cap * design.minSocPct / 100,
      // PV AC output is capped by the inverters' continuous rating.
      pvAcMax: design.inverters * I.maxContinuousKw,
      // Battery power limited by the tighter of inverter DC current and BMS.
      chargeMax: Math.min(design.inverters * I.batteryChargeA,
                          design.batteries * B.maxContinuousA) * B.nominalV / 1000,
      dischargeMax: Math.min(design.inverters * I.batteryOnlyKw,
                             design.batteries * B.maxContinuousA * B.nominalV / 1000 * I.effBatteryToLoad)
    };
  }

  /**
   * One hour of PV/battery dispatch without the generator.
   * Returns the new stored energy and the flows; `unmet` is AC energy still
   * needed from the generator (or lost if none is available).
   */
  function stepNoGen(soc, loadAc, pvDc, L) {
    var I = EQ.inverter;
    var pvAcAvail = Math.min(pvDc * I.effPvToLoad, L.pvAcMax);
    var direct = Math.min(loadAc, pvAcAvail);
    var pvLeftDc = pvDc - direct / I.effPvToLoad;
    var chargeIn = Math.min(pvLeftDc * I.effPvToBattery, L.cap - soc, L.chargeMax);
    var curtailed = pvLeftDc - chargeIn / I.effPvToBattery;
    soc += chargeIn;
    var deficit = loadAc - direct;
    var discharge = Math.min(deficit, (soc - L.floor) * I.effBatteryToLoad, L.dischargeMax);
    if (discharge < 0) discharge = 0;
    soc -= discharge / I.effBatteryToLoad;
    return {
      soc: soc,
      direct: direct,
      pvToBattery: chargeIn,
      curtailed: Math.max(0, curtailed),
      discharge: discharge,
      unmet: deficit - discharge
    };
  }

  /**
   * Whether stored energy falls below `below` at any point in the look-ahead
   * window if the generator stays off, using forecast PV. Used by the
   * forecast-aware dispatch. Stops at the first dip, since that settles it.
   */
  function forecastDips(soc, t, series, fcst, L, below) {
    if (soc < below) return true;
    var end = Math.min(HOURS_PER_YEAR, t + LOOKAHEAD_H);
    for (var k = t; k < end; k++) {
      var day = (k / 24) | 0;
      var r = stepNoGen(soc, series.load[k], series.pv[k] * fcst[day], L);
      soc = r.soc - r.unmet / EQ.inverter.effBatteryToLoad; // debt below floor
      if (soc < below) return true;
    }
    return false;
  }

  /** Fresh generator state. */
  function newGenerator() {
    return { kwhSinceService: 0, services: 0, efficiency: 1, lifetimeKwh: 0 };
  }

  /**
   * Book generator production against its service/degradation schedule.
   * Fuel cost per kWh rises as efficiency falls: $1.65 / efficiency. An
   * optional carbon-price add-on is expressed per delivered generator kWh so
   * it can be modelled transparently without assuming a fuel burn rate.
   * Returns the cost of this energy (fuel + any services it triggers).
   */
  function runGenerator(gen, kwh, s) {
    var G = EQ.generator;
    var cost = 0;
    var remaining = kwh;
    while (remaining > 1e-12) {
      var chunk = Math.min(remaining, G.serviceIntervalKwh - gen.kwhSinceService);
      cost += chunk * (s.genCostPerKwh / gen.efficiency + (s.genCarbonPricePerKwh || 0));
      gen.kwhSinceService += chunk;
      gen.lifetimeKwh += chunk;
      remaining -= chunk;
      if (gen.kwhSinceService >= G.serviceIntervalKwh - 1e-9) {
        gen.kwhSinceService = 0;
        gen.services++;
        cost += s.genServiceCost;
        gen.efficiency *= (1 - G.efficiencyLossPerService);
        if (gen.efficiency < s.genReplaceAtEff) {
          cost += s.genReplaceCost;
          gen.replacements = (gen.replacements || 0) + 1;
          gen.efficiency = 1;
        }
      }
    }
    return cost;
  }

  /**
   * Simulate one year hour by hour.
   *
   * Strategies:
   *   'soc'   conventional auto-start — start at socStartPct, run until socStopPct
   *   'smart' forecast-aware — start only when the forecast says the battery
   *           would hit its floor within 36 h, stop as soon as the stored energy
   *           bridges to the next solar surplus (+ reserve), so generator kWh
   *           never displace free solar the next morning.
   *
   * Either way the generator is also started as a last resort if the battery
   * is at its floor and load would go unserved.
   */
  function simulateYear(design, opts) {
    opts = opts || {};
    var s = design;
    var I = EQ.inverter;
    var L = limits(design);
    var psh = opts.psh || dailyPsh(s.weatherMode, s.weatherSeed);
    var series = yearSeries(design, psh, opts.pvAgeFactor);
    var fcst = forecastFactors(s.forecastErrorPct, s.weatherSeed);
    var strategy = opts.strategy || s.genStrategy;
    var gen = opts.generator || newGenerator();
    var genKw = EQ.generator.ratedKw;
    var reserve = s.reserveKwh;
    var startE = L.cap * s.socStartPct / 100;
    var stopE = L.cap * s.socStopPct / 100;

    var minRun = s.genMinRunH || 1;
    var soc = opts.startSoc != null ? opts.startSoc * L.cap : L.cap;
    var running = false;
    var runFor = 0;
    var keep = !!opts.keepHourly;
    var H = keep ? {
      load: series.load, pv: series.pv,
      direct: new Float64Array(HOURS_PER_YEAR),
      discharge: new Float64Array(HOURS_PER_YEAR),
      gen: new Float64Array(HOURS_PER_YEAR),
      pvToBattery: new Float64Array(HOURS_PER_YEAR),
      genToBattery: new Float64Array(HOURS_PER_YEAR),
      curtailed: new Float64Array(HOURS_PER_YEAR),
      unserved: new Float64Array(HOURS_PER_YEAR),
      soc: new Float64Array(HOURS_PER_YEAR)
    } : null;

    var T = { load: 0, pv: 0, direct: 0, discharge: 0, gen: 0, genToLoad: 0,
              genToBattery: 0, pvToBattery: 0, curtailed: 0, unserved: 0,
              genHours: 0, genStarts: 0, genCost: 0, minSoc: 1 };
    var byMonth = [];
    for (var m = 0; m < 12; m++) {
      byMonth.push({ load: 0, pv: 0, solarUsed: 0, gen: 0, curtailed: 0, unserved: 0, genCost: 0 });
    }
    var servicesAtStart = gen.services;

    for (var t = 0; t < HOURS_PER_YEAR; t++) {
      var load = series.load[t], pv = series.pv[t];
      var r = stepNoGen(soc, load, pv, L);

      // ── Generator decision ─────────────────────────────────────────────
      if (strategy === 'soc') {
        if (!running && (r.soc <= startE || r.unmet > 1e-9)) running = true;
        if (running && runFor >= minRun && soc >= stopE) running = false;
      } else {
        if (!running) {
          // Start when load would go unserved, or when the forecast says the
          // battery will dip below its reserve and the shortfall is imminent
          // (next few hours): a later start gives real sun more chance to
          // beat the forecast. The cheap imminence test goes first.
          if (r.unmet > 1e-9 ||
              (r.soc < L.floor + reserve + genKw && forecastDips(soc, t, series, fcst, L, L.floor + reserve))) {
            running = true;
          }
        } else if (runFor >= minRun && !forecastDips(soc, t, series, fcst, L, L.floor + reserve)) {
          running = false;
        }
      }
      runFor = running ? runFor + 1 : 0;

      var genOut = 0, genToLoad = 0, genToBatt = 0;
      if (running) {
        // Generator carries the load this hour; PV surplus + remaining
        // generator capacity charge the battery (AC→DC at 94 %).
        var pvAc = Math.min(pv * I.effPvToLoad, L.pvAcMax);
        var direct = Math.min(load, pvAc);
        genToLoad = Math.min(genKw, load - direct);
        var pvLeft = pv - direct / I.effPvToLoad;
        var pvCharge = Math.min(pvLeft * I.effPvToBattery, L.cap - soc, L.chargeMax);
        soc += pvCharge;
        var room = Math.min(L.cap - soc, L.chargeMax - pvCharge);
        genToBatt = Math.max(0, Math.min((genKw - genToLoad) * I.effAcToBattery, room));
        soc += genToBatt;
        genOut = genToLoad + genToBatt / I.effAcToBattery;
        var stillShort = load - direct - genToLoad;
        var dis = Math.min(stillShort, Math.max(0, soc - L.floor) * I.effBatteryToLoad, L.dischargeMax);
        soc -= dis / I.effBatteryToLoad;
        r = {
          soc: soc, direct: direct, pvToBattery: pvCharge,
          curtailed: Math.max(0, pvLeft - pvCharge / I.effPvToBattery),
          discharge: dis, unmet: stillShort - dis
        };
        if (genOut > 0) T.genHours++;
      }
      soc = r.soc;

      var cost = genOut > 0 ? runGenerator(gen, genOut, s) : 0;
      var month = MONTH_OF_DAY[(t / 24) | 0];
      var unserved = Math.max(0, r.unmet);

      if (genOut > 0 && !T._prevGen) T.genStarts++;
      T._prevGen = genOut > 0;

      T.load += load; T.pv += pv; T.direct += r.direct; T.discharge += r.discharge;
      T.gen += genOut; T.genToLoad += genToLoad; T.genToBattery += genToBatt;
      T.pvToBattery += r.pvToBattery; T.curtailed += r.curtailed; T.unserved += unserved;
      T.genCost += cost;
      if (soc / L.cap < T.minSoc) T.minSoc = soc / L.cap;

      var bm = byMonth[month];
      bm.load += load; bm.pv += pv; bm.gen += genOut; bm.curtailed += r.curtailed;
      bm.unserved += unserved; bm.genCost += cost;
      bm.solarUsed += r.direct + r.pvToBattery / I.effPvToBattery;

      if (H) {
        H.direct[t] = r.direct; H.discharge[t] = r.discharge; H.gen[t] = genOut;
        H.pvToBattery[t] = r.pvToBattery; H.genToBattery[t] = genToBatt;
        H.curtailed[t] = r.curtailed; H.unserved[t] = unserved; H.soc[t] = soc / L.cap;
      }
    }
    delete T._prevGen;
    T.genServices = gen.services - servicesAtStart;
    // Share of load ultimately met by solar: everything not supplied by the
    // generator (directly, or via the battery at its discharge efficiency).
    var fromGen = T.genToLoad + T.genToBattery * I.effBatteryToLoad;
    T.solarFraction = T.load > 0 ? Math.max(0, 1 - (fromGen + T.unserved) / T.load) : 0;
    T.endSoc = soc / L.cap;

    return { totals: T, byMonth: byMonth, hourly: H, psh: psh, generator: gen, limits: L };
  }

  /**
   * Steady-state year: run once to settle the end-of-year battery state, then
   * run again starting from it so 1 January doesn't get a free full battery.
   */
  function simulateSteadyYear(design, opts) {
    opts = opts || {};
    var warm = simulateYear(design, Object.assign({}, opts, { keepHourly: false, generator: newGenerator() }));
    return simulateYear(design, Object.assign({}, opts, { startSoc: warm.totals.endSoc }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. AUTONOMY — N days of whole-home backup with no generator
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Starting from a full battery at midnight, run the average day of `seasonId`
   * with no generator. Returns hours carried before the first unserved hour.
   * `solar: false` models panels covered by snow / a total overcast.
   */
  function autonomy(design, seasonId, maxDays, withSolar) {
    var season = seasonById(seasonId);
    var L = limits(design);
    var daily = seasonalDailyLoad(season, design.springBaseKwh);
    var over = overheadKw(design, season);
    var pvDay = withSolar === false ? 0 : design.pvKw * design.pvDerate * season.psh;
    var soc = L.cap;
    var minSoc = 1;
    var hours = (maxDays || 14) * 24;
    for (var t = 0; t < hours; t++) {
      var h = t % 24;
      var r = stepNoGen(soc, daily * LOAD_SHAPE[h] + over, pvDay * SOLAR_SHAPE[h], L);
      if (r.unmet > 1e-6) return { hours: t, days: t / 24, minSoc: L.floor / L.cap, capped: false };
      soc = r.soc;
      if (soc / L.cap < minSoc) minSoc = soc / L.cap;
    }
    return { hours: hours, days: hours / 24, minSoc: minSoc, capped: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. LIFECYCLE GENERATOR COST + OPTIMIZER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generator cost for each year of the horizon given each year's kWh,
   * carrying service count and efficiency across years (costs escalate at
   * `escalationPct` per year).
   */
  function generatorCostByYear(kwhByYear, s) {
    var gen = newGenerator();
    return kwhByYear.map(function (kwh, y) {
      var before = { services: gen.services, replacements: gen.replacements || 0 };
      var esc = Math.pow(1 + s.escalationPct / 100, y);
      var cost = runGenerator(gen, kwh, s) * esc;
      return {
        year: y + 1,
        kwh: kwh,
        cost: cost,
        services: gen.services - before.services,
        replacements: (gen.replacements || 0) - before.replacements,
        efficiencyEnd: gen.efficiency
      };
    });
  }

  function pvAgeFactor(design, yearIndex) {
    return 1 - EQ.panel.degradationPctPerYr / 100 * yearIndex;
  }

  /**
   * Generator kWh for every year of the horizon. PV ageing changes slowly and
   * almost linearly, so only the first and last years are simulated and the
   * years between are interpolated (within 0.3 % of simulating every fourth
   * year). Pass the first year's generator kWh if it is already known.
   */
  function lifecycleEnergy(design, firstYearGen) {
    var n = design.horizonYears;
    var first = firstYearGen != null ? firstYearGen : simulateSteadyYear(design).totals.gen;
    if (n < 2) return [first];
    var last = simulateSteadyYear(design, { pvAgeFactor: pvAgeFactor(design, n - 1) }).totals.gen;
    var kwh = [];
    for (var i = 0; i < n; i++) kwh.push(first + (last - first) * i / (n - 1));
    return kwh;
  }

  /**
   * Sweep panel and battery counts; for each, auto-size inverters/GridBOSS,
   * simulate a steady-state year, and score on lifecycle cost (capex + NPV of
   * generator, O&M and replacements). Designs that fail the N-day autonomy
   * requirement or leave any load unserved are marked infeasible.
   *
   * `costFn(design, genKwhByYear)` is supplied by the budget module, and the
   * generator kWh include PV ageing (lifecycleEnergy), so the optimizer and
   * the budget can never disagree about cost.
   */
  function optimize(s, costFn, opts) {
    opts = opts || {};
    var grid = optimizerGrid(s, opts);
    var rows = [];
    var best = null;
    grid.panels.forEach(function (p) {
      for (var b = minimums(p, s).batteries; b <= grid.batteryMax; b++) {
        var row = evaluate(s, costFn, p, b);
        rows.push(row);
        if (row.feasible && (!best || row.lifecycle < best.lifecycle)) best = row;
      }
    });
    return { rows: rows, best: best, panelStep: grid.panelStep };
  }

  /** Panel counts and battery range the optimizer sweeps. */
  function optimizerGrid(s, opts) {
    opts = opts || {};
    var step = opts.panelStep || 4;
    var panels = [];
    for (var p = opts.panelMin || 20; p <= s.maxPanels; p += step) panels.push(p);
    return { panels: panels, panelStep: step, batteryMax: opts.batteryMax || 20 };
  }

  /** Simulate and cost one panels × batteries candidate. */
  function evaluate(s, costFn, panels, batteries) {
    var d = buildDesign(s, { panels: panels, batteries: batteries, inverters: 0 });
    var sim = simulateSteadyYear(d, { strategy: s.genStrategy });
    var aut = autonomy(d, s.autonomySeason, s.autonomyDays + 1, true);
    var feasible = aut.days >= s.autonomyDays && sim.totals.unserved < 0.01 && d.layout.ok;
    var cost = costFn(d, lifecycleEnergy(d, sim.totals.gen));
    return {
      panels: panels, batteries: d.batteries, inverters: d.inverters, gridboss: d.gridboss,
      genKwh: sim.totals.gen, autonomyDays: aut.days, feasible: feasible,
      capex: cost.capex, lifecycle: cost.lifecycle, annualOpex: cost.annualOpex
    };
  }

  /**
   * Simulate and cost one candidate in each of several weather years
   * (seeds for the day-to-day weather). One year can flatter or punish a
   * design, so the search ranks on the average and the worst year.
   * Feasible only if it serves every hour in every year.
   */
  function evaluateYears(s, costFn, panels, batteries, seeds) {
    var rows = seeds.map(function (seed) {
      return evaluate(Object.assign({}, s, { weatherMode: 'variable', weatherSeed: seed }), costFn, panels, batteries);
    });
    function mean(k) { return rows.reduce(function (a, r) { return a + r[k]; }, 0) / rows.length; }
    var r0 = rows[0];
    return {
      panels: r0.panels, batteries: r0.batteries, inverters: r0.inverters, gridboss: r0.gridboss,
      autonomyDays: r0.autonomyDays, capex: r0.capex,
      feasible: rows.every(function (r) { return r.feasible; }),
      genKwh: mean('genKwh'), annualOpex: mean('annualOpex'), lifecycle: mean('lifecycle'),
      worstLifecycle: Math.max.apply(null, rows.map(function (r) { return r.lifecycle; })),
      years: rows.length
    };
  }

  return Object.freeze({
    HOURS_PER_YEAR: HOURS_PER_YEAR,
    LOAD_SHAPE: LOAD_SHAPE,
    SOLAR_SHAPE: SOLAR_SHAPE,
    MONTH_OF_DAY: MONTH_OF_DAY,
    seasonOfDay: seasonOfDay,
    seasonById: seasonById,
    seasonalDailyLoad: seasonalDailyLoad,
    overheadKw: overheadKw,
    vocMax: vocMax,
    vmpAt: vmpAt,
    stringDesign: stringDesign,
    stringLayout: stringLayout,
    minimums: minimums,
    buildDesign: buildDesign,
    rng: rng,
    dailyPsh: dailyPsh,
    forecastFactors: forecastFactors,
    limits: limits,
    stepNoGen: stepNoGen,
    newGenerator: newGenerator,
    runGenerator: runGenerator,
    simulateYear: simulateYear,
    simulateSteadyYear: simulateSteadyYear,
    autonomy: autonomy,
    generatorCostByYear: generatorCostByYear,
    pvAgeFactor: pvAgeFactor,
    lifecycleEnergy: lifecycleEnergy,
    optimize: optimize,
    optimizerGrid: optimizerGrid,
    evaluate: evaluate,
    evaluateYears: evaluateYears
  });
}));
