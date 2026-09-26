/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage Data Module — data.js
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Every fixed input the planner uses, in one place, each tagged with its source:
 *   - Challenge-given values (load, seasons, peak sun hours, generator, prices)
 *   - Manufacturer datasheet values (FlexBOSS21, GridBOSS, EG4 280Ah, JA Solar)
 *   - Victoria, BC values (climate, City permit fees, BC tax rules, BC Hydro)
 *
 * Anything the user may reasonably want to change lives in settings.js instead;
 * these are the facts the settings default from.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SunData = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD — challenge package "Typical Spring Day — Hourly Consumption"
  // kWh in each hour (00:00 … 23:00) for the 30 kWh/day spring baseline.
  // ═══════════════════════════════════════════════════════════════════════════
  var SPRING_HOURLY_KWH = [
    0.87, 0.81, 0.78, 0.78, 0.81, 1.00, 1.31, 1.68, 1.62, 1.34, 1.15, 1.09,
    1.09, 1.06, 1.06, 1.12, 1.31, 1.65, 1.93, 1.90, 1.74, 1.56, 1.31, 1.03
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // SOLAR — challenge package "Typical Solar Panel Daily Production by Hour"
  // Percent of the day's production in each hour; sums to 100.
  // ═══════════════════════════════════════════════════════════════════════════
  var SOLAR_HOURLY_PCT = [
    0, 0, 0, 0, 0, 0, 1, 2, 5, 8, 11, 13,
    14, 14, 12, 9, 6, 3, 1.5, 0.5, 0, 0, 0, 0
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // SEASONS — challenge package (Victoria, BC)
  //   loadFactor: multiplier on the 30 kWh/day spring baseline
  //   psh:        average equivalent peak sun hours per day
  //   months:     calendar months (0 = Jan) assigned to the season
  // ═══════════════════════════════════════════════════════════════════════════
  var SEASONS = [
    { id: 'winter', name: 'Winter', loadFactor: 1.30, psh: 1.17, months: [11, 0, 1] },
    { id: 'spring', name: 'Spring', loadFactor: 1.00, psh: 4.25, months: [2, 3, 4] },
    { id: 'summer', name: 'Summer', loadFactor: 0.85, psh: 6.02, months: [5, 6, 7] },
    { id: 'fall',   name: 'Fall',   loadFactor: 1.15, psh: 2.41, months: [8, 9, 10] }
  ];

  var DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ═══════════════════════════════════════════════════════════════════════════
  // EQUIPMENT — manufacturer datasheets; unit prices from the challenge package
  // ═══════════════════════════════════════════════════════════════════════════
  var EQUIPMENT = {
    panel: {
      model: 'JA Solar JAM54D41-440/LB',
      pmaxW: 440,
      vocV: 38.90,
      iscA: 14.30,
      vmpV: 32.47,
      impA: 13.55,
      tempCoeffVocPct: -0.250,   // %/°C — challenge package
      tempCoeffPmaxPct: -0.290,  // %/°C — JA Solar datasheet (n-type TOPCon)
      areaM2: 1.762 * 1.134,
      degradationPctPerYr: 0.40, // JA Solar linear warranty, years 2–30
      unitPrice: 350,            // incl. racking — challenge package
      source: 'JA Solar JAM54D41 LB datasheet'
    },
    inverter: {
      model: 'EG4 FlexBOSS21',
      maxContinuousKw: 16,        // with PV & battery
      batteryOnlyKw: 12,          // battery alone
      peakKw1s: 18,
      maxPvKw: 21,                // recommended max array (STC)
      maxDcV: 600,
      mpptHighProtectV: 550,      // inverter faults above this
      mpptOperatingV: [120, 440],
      mpptFullPowerV: [250, 440],
      mppts: [
        { id: 1, ratedA: 26, iscA: 31, inputs: 2 },
        { id: 2, ratedA: 26, iscA: 31, inputs: 2 },
        { id: 3, ratedA: 15, iscA: 19, inputs: 1 }
      ],
      batteryChargeA: 250,
      batteryDischargeA: 250,
      minBatteryAhPerInverter: 600,  // "recommended min. capacity per inverter"
      effPvToLoad: 0.97,
      effPvToBattery: 0.945,
      effBatteryToLoad: 0.94,
      effAcToBattery: 0.94,
      idleW: 65,                  // standby consumption, <65 W @25 °C
      unitPrice: 5500,
      source: 'EG4 FlexBOSS21 spec sheet v1.3.0'
    },
    gridboss: {
      model: 'EG4 GridBOSS',
      ratedA: 200,
      maxInverters: 3,           // three 90 A hybrid ports
      generatorPortA: 125,
      smartPortsA: [125, 80, 60, 60],
      unitPrice: 2500,
      source: 'EG4 GridBOSS spec sheet'
    },
    battery: {
      model: 'EG4 WallMount All Weather 280Ah',
      nominalV: 51.2,
      capacityAh: 280,
      energyKwh: 51.2 * 280 / 1000, // 14.336 kWh
      minSocPct: 20,             // EG4 recommended SOC cutoff (80 % DoD)
      maxContinuousA: 140,
      heaterW: 224,
      cycleLife: 8000,           // @ 80 % DoD
      designLifeYears: 15,
      unitPrice: 5500,
      source: 'EG4 WallMount All Weather spec sheet v1.2.1'
    },
    generator: {
      model: 'BE7500ID (existing)',
      ratedKw: 6,
      costPerKwh: 1.65,          // challenge package
      serviceIntervalKwh: 100,
      serviceCost: 300,
      efficiencyLossPerService: 0.02,
      source: 'Challenge package'
    },
    fusedDisconnect: { model: '400 A fused service disconnect', unitPrice: 1500 },
    splitter:        { model: 'Distribution splitter',           unitPrice: 4500 },
    panel200:        { model: '200 A electrical panel',          unitPrice: 1500 }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // VICTORIA, BC
  // ═══════════════════════════════════════════════════════════════════════════
  var VICTORIA = {
    // Record low −15.0 °C (Victoria, 28 Dec 1968). The default design
    // temperature sits a degree below it for margin.
    recordLowC: -15.0,
    designLowC: -16.0,
    // Typical summer cell temperature for the hot-Vmp string check.
    designHotCellC: 65,

    // City of Victoria "Permits and Inspections Fees and Deposits"
    // (0018BLDG2021, 3 Sep 2026). Contractor electrical permit fee is based on
    // the total value of all work, owner-supplied equipment included.
    electricalPermit: {
      tiers: [
        { upTo: 300, fee: 36 },
        { upTo: 500, fee: 43 },
        { upTo: 700, fee: 50 },
        { upTo: 1000, fee: 61 }
      ],
      midBase: 61, midPerThousand: 20,          // $1,001–$20,000
      highBase: 441, highPct: 0.0125            // over $20,000
    },
    buildingPermit: { applicationFee: 100, pct: 0.014 },

    // BC tax. PST Bulletin 203: PV panels and the wiring, controllers and
    // DC→AC devices bought as part of a PV system are PST-exempt; batteries
    // are generic goods and are NOT exempt.
    gstPct: 5,
    pstPct: 7,

    // BC Hydro residential inclining block rate, effective 1 Apr 2026.
    bcHydro: {
      step1PerKwh: 0.1097,
      step2PerKwh: 0.1408,
      step1KwhPerMonth: 675,
      basicChargePerMonth: 6.17
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SOURCES — shown in the app's reference panel and the generated report
  // ═══════════════════════════════════════════════════════════════════════════
  var SOURCES = [
    { id: 'challenge', label: 'URECx Solve Design Hackathon Challenge Package', url: '' },
    { id: 'flexboss', label: 'EG4 FlexBOSS21 spec sheet', url: 'https://eg4electronics.com/wp-content/uploads/2024/10/EG4-FlexBoss21-Spec-Sheet.pdf' },
    { id: 'gridboss', label: 'EG4 GridBOSS spec sheet', url: 'https://eg4electronics.com/categories/inverters/eg4-gridboss/' },
    { id: 'battery', label: 'EG4 WallMount All Weather 280Ah spec sheet', url: 'https://eg4electronics.com/wp-content/uploads/2025/09/EG4-WallMount-All-Weather-Battery-Spec-Sheet.pdf' },
    { id: 'panel', label: 'JA Solar JAM54D41 LB datasheet', url: 'https://www.jasolar.com/uploadfile/2023/0606/20230606020521211.pdf' },
    { id: 'vicfees', label: 'City of Victoria permits & inspections fees', url: 'https://www.victoria.ca/media/file/permits-and-inspections-fees-and-deposits' },
    { id: 'pst203', label: 'BC PST Bulletin 203 — Energy, Energy Conservation', url: 'https://www2.gov.bc.ca/assets/gov/taxes/sales-taxes/publications/pst-203-energy-conservation-ice-fund-tax.pdf' },
    { id: 'bchydro', label: 'BC Hydro Electric Tariff (1 Apr 2026)', url: 'https://www.bchydro.com/content/dam/BCHydro/customer-portal/documents/corporate/tariff-filings/electric-tariff/bchydro-electric-tariff.pdf' },
    { id: 'climate', label: 'Victoria historical extreme minimum temperature', url: 'https://victoria.weatherstats.ca/metrics/extreme_min_temperature.html' }
  ];

  return Object.freeze({
    SPRING_HOURLY_KWH: Object.freeze(SPRING_HOURLY_KWH),
    SOLAR_HOURLY_PCT: Object.freeze(SOLAR_HOURLY_PCT),
    SEASONS: Object.freeze(SEASONS),
    DAYS_IN_MONTH: Object.freeze(DAYS_IN_MONTH),
    MONTH_NAMES: Object.freeze(MONTH_NAMES),
    EQUIPMENT: EQUIPMENT,
    VICTORIA: VICTORIA,
    SOURCES: SOURCES
  });
}));
