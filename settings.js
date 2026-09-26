/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage Settings — settings.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Schema-driven source of truth for every adjustable parameter. The control
 * panel is generated from SCHEMA, so a new knob here appears in the app.
 * Values persist to localStorage when available and fall back to memory.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SunSettings = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var STORAGE_KEY = 'sunpage.settings.v1';

  var GROUPS = [
    { id: 'design',    title: 'System design',          hint: 'Counts below the datasheet minimums are raised automatically.' },
    { id: 'load',      title: 'Household load',         hint: 'Challenge baseline: 30 kWh/day in spring.' },
    { id: 'solar',     title: 'Solar & climate',        hint: 'Victoria, BC peak sun hours come from the challenge package.' },
    { id: 'generator', title: 'Generator automation',   hint: 'How and when the existing 6 kW generator is dispatched.' },
    { id: 'battery',   title: 'Battery & backup target', hint: 'The N-day whole-home backup requirement.' },
    { id: 'finance',   title: 'Budget & finance',       hint: 'Victoria labour rates, contingency and lifecycle assumptions.' }
  ];

  // type: 'range' slider · 'choice' segmented buttons · 'bool' switch
  var SCHEMA = [
    // ── Design ──────────────────────────────────────────────────────────
    { key: 'panels', group: 'design', type: 'range', label: 'Solar panels (440 W)', min: 12, max: 160, step: 1, def: 92, unit: '' },
    { key: 'batteries', group: 'design', type: 'range', label: 'EG4 280Ah batteries', min: 1, max: 24, step: 1, def: 5, unit: '' },
    { key: 'inverters', group: 'design', type: 'range', label: 'FlexBOSS21 inverters (min)', min: 1, max: 8, step: 1, def: 2, unit: '' },
    { key: 'roofSharePct', group: 'design', type: 'range', label: 'Share of array on roof', min: 0, max: 100, step: 5, def: 50, unit: '%', hint: 'Remainder is ground/carport mount: no rapid-shutdown devices, but needs a building permit.' },
    { key: 'maxPanels', group: 'design', type: 'range', label: 'Site limit for optimizer', min: 24, max: 160, step: 4, def: 120, unit: 'panels' },
    { key: 'serviceA', group: 'design', type: 'choice', label: 'Service size', options: [{ v: 200, t: '200 A' }, { v: 400, t: '400 A' }], def: 400 },

    // ── Load ────────────────────────────────────────────────────────────
    { key: 'springBaseKwh', group: 'load', type: 'range', label: 'Spring baseline', min: 10, max: 60, step: 1, def: 30, unit: 'kWh/day' },
    { key: 'designPeakKw', group: 'load', type: 'range', label: 'Design peak demand', min: 5, max: 40, step: 1, def: 15, unit: 'kW', hint: 'Coincident peak incl. heat-pump / range starts; sets the inverter count.' },
    { key: 'includeIdle', group: 'load', type: 'bool', label: 'Count inverter idle draw (65 W each)', def: true },
    { key: 'heaterHoursWinter', group: 'load', type: 'range', label: 'Battery heater run time (winter)', min: 0, max: 8, step: 0.5, def: 0.5, unit: 'h/day' },

    // ── Solar ───────────────────────────────────────────────────────────
    { key: 'pvDerate', group: 'solar', type: 'range', label: 'PV DC derate', min: 0.7, max: 1, step: 0.01, def: 0.88, unit: '×', hint: 'Soiling, wiring, mismatch, temperature. Inverter efficiency is modelled separately.' },
    { key: 'weatherMode', group: 'solar', type: 'choice', label: 'Weather', options: [{ v: 'average', t: 'Seasonal average' }, { v: 'variable', t: 'Day-to-day variable' }], def: 'variable' },
    { key: 'weatherSeed', group: 'solar', type: 'range', label: 'Weather year (seed)', min: 1, max: 50, step: 1, def: 7, unit: '' },
    { key: 'designLowC', group: 'solar', type: 'range', label: 'Design minimum temperature', min: -30, max: 0, step: 0.5, def: -16, unit: '°C', hint: 'Victoria record low −15.0 °C (Dec 1968).' },
    { key: 'designHotCellC', group: 'solar', type: 'range', label: 'Design hot cell temperature', min: 40, max: 85, step: 1, def: 65, unit: '°C' },

    // ── Generator ───────────────────────────────────────────────────────
    { key: 'genStrategy', group: 'generator', type: 'choice', label: 'Dispatch strategy', options: [{ v: 'smart', t: 'Forecast-aware' }, { v: 'soc', t: 'SOC trigger' }], def: 'smart' },
    { key: 'reserveKwh', group: 'generator', type: 'range', label: 'Forecast reserve', min: 0, max: 20, step: 0.5, def: 4, unit: 'kWh' },
    { key: 'forecastErrorPct', group: 'generator', type: 'range', label: 'Solar forecast error (σ)', min: 0, max: 60, step: 5, def: 20, unit: '%' },
    { key: 'genMinRunH', group: 'generator', type: 'range', label: 'Minimum run time per start', min: 1, max: 6, step: 1, def: 3, unit: 'h', hint: 'Avoids short-cycling: fewer cold starts, full-load running.' },
    { key: 'socStartPct', group: 'generator', type: 'range', label: 'SOC trigger: start at', min: 20, max: 60, step: 1, def: 30, unit: '%' },
    { key: 'socStopPct', group: 'generator', type: 'range', label: 'SOC trigger: stop at', min: 40, max: 100, step: 1, def: 90, unit: '%' },
    { key: 'genCostPerKwh', group: 'generator', type: 'range', label: 'Generator energy cost', min: 0.5, max: 4, step: 0.05, def: 1.65, unit: '$/kWh' },
    { key: 'genServiceCost', group: 'generator', type: 'range', label: 'Service cost (per 100 kWh)', min: 100, max: 800, step: 10, def: 300, unit: '$' },
    { key: 'genReplaceAtEff', group: 'generator', type: 'range', label: 'Replace generator below', min: 0.5, max: 0.9, step: 0.01, def: 0.7, unit: '× eff.' },
    { key: 'genReplaceCost', group: 'generator', type: 'range', label: 'Generator replacement cost', min: 1000, max: 10000, step: 100, def: 3500, unit: '$' },

    // ── Battery / backup ────────────────────────────────────────────────
    { key: 'minSocPct', group: 'battery', type: 'range', label: 'Battery SOC floor', min: 5, max: 40, step: 1, def: 20, unit: '%', hint: 'EG4 recommends ≥ 20 % (80 % DoD) for the 8,000-cycle rating.' },
    { key: 'autonomyDays', group: 'battery', type: 'range', label: 'Whole-home backup target', min: 1, max: 7, step: 1, def: 3, unit: 'days' },
    { key: 'autonomySeason', group: 'battery', type: 'choice', label: 'Backup design season', options: [{ v: 'winter', t: 'Winter' }, { v: 'fall', t: 'Fall' }, { v: 'spring', t: 'Spring' }, { v: 'summer', t: 'Summer' }], def: 'winter' },

    // ── Finance ─────────────────────────────────────────────────────────
    { key: 'electricianRate', group: 'finance', type: 'range', label: 'Electrician (billed)', min: 80, max: 200, step: 5, def: 125, unit: '$/h' },
    { key: 'installerRate', group: 'finance', type: 'range', label: 'Solar installer (billed)', min: 50, max: 150, step: 5, def: 85, unit: '$/h' },
    { key: 'overheadPct', group: 'finance', type: 'range', label: 'Contractor overhead & profit', min: 0, max: 30, step: 1, def: 12, unit: '%' },
    { key: 'contingencyPct', group: 'finance', type: 'range', label: 'Contingency', min: 0, max: 25, step: 1, def: 10, unit: '%' },
    { key: 'freightPct', group: 'finance', type: 'range', label: 'Freight to Vancouver Island', min: 0, max: 10, step: 0.5, def: 3, unit: '% equip.' },
    { key: 'horizonYears', group: 'finance', type: 'range', label: 'Analysis horizon', min: 10, max: 30, step: 1, def: 25, unit: 'years' },
    { key: 'discountPct', group: 'finance', type: 'range', label: 'Discount rate', min: 0, max: 10, step: 0.5, def: 4, unit: '%' },
    { key: 'escalationPct', group: 'finance', type: 'range', label: 'Cost escalation', min: 0, max: 6, step: 0.5, def: 2, unit: '%/yr' },
    { key: 'inverterReplaceYear', group: 'finance', type: 'range', label: 'Inverter replacement year', min: 8, max: 25, step: 1, def: 13, unit: '' },
    { key: 'batteryReplaceYear', group: 'finance', type: 'range', label: 'Battery replacement year', min: 10, max: 30, step: 1, def: 16, unit: '' },
    { key: 'omPerYear', group: 'finance', type: 'range', label: 'Annual inspection & O&M', min: 0, max: 1500, step: 50, def: 300, unit: '$/yr' },
    { key: 'keepUtility', group: 'finance', type: 'bool', label: 'Keep BC Hydro connection as standby', def: true }
  ];

  function defaults() {
    var d = {};
    SCHEMA.forEach(function (f) { d[f.key] = f.def; });
    return d;
  }

  function field(key) {
    for (var i = 0; i < SCHEMA.length; i++) if (SCHEMA[i].key === key) return SCHEMA[i];
    return null;
  }

  /** Coerce and clamp a value to its schema field. */
  function sanitize(key, value) {
    var f = field(key);
    if (!f) return undefined;
    if (f.type === 'bool') return !!value;
    if (f.type === 'choice') {
      for (var i = 0; i < f.options.length; i++) {
        if (String(f.options[i].v) === String(value)) return f.options[i].v;
      }
      return f.def;
    }
    var n = Number(value);
    if (!isFinite(n)) return f.def;
    return Math.min(f.max, Math.max(f.min, n));
  }

  var memory = null;

  function storage() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) { /* blocked */ }
    return null;
  }

  function load() {
    var s = defaults();
    var raw = null;
    try { var st = storage(); raw = st ? st.getItem(STORAGE_KEY) : memory; } catch (e) { raw = memory; }
    if (raw) {
      try {
        var saved = JSON.parse(raw);
        Object.keys(saved).forEach(function (k) {
          var v = sanitize(k, saved[k]);
          if (v !== undefined) s[k] = v;
        });
      } catch (e) { /* corrupt → defaults */ }
    }
    return s;
  }

  function save(s) {
    var raw = JSON.stringify(s);
    memory = raw;
    try { var st = storage(); if (st) st.setItem(STORAGE_KEY, raw); } catch (e) { /* memory only */ }
  }

  function clear() {
    memory = null;
    try { var st = storage(); if (st) st.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  return Object.freeze({
    GROUPS: GROUPS,
    SCHEMA: SCHEMA,
    defaults: defaults,
    field: field,
    sanitize: sanitize,
    load: load,
    save: save,
    clear: clear
  });
}));
