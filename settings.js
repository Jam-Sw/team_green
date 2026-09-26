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
    { id: 'design',    title: 'System',           hint: 'What gets installed. A count is raised automatically when a rule needs more.' },
    { id: 'load',      title: 'Home',             hint: 'How much power the house uses.' },
    { id: 'solar',     title: 'Solar & weather',  hint: 'Victoria sun hours come from the challenge package.' },
    { id: 'generator', title: 'Generator',        hint: 'When the existing 6 kW generator runs, and what it costs.' },
    { id: 'battery',   title: 'Battery & backup', hint: 'How deep the battery is used, and the backup test it must pass.' },
    { id: 'finance',   title: 'Costs',            hint: 'Labour rates, markups, and how future costs are counted.' }
  ];

  // type: 'range' slider · 'choice' segmented buttons · 'bool' switch
  // unit: shown after the value ('$…' units are shown before it: $3,500/yr)
  // pct: stored as a fraction, shown as a percentage
  var SCHEMA = [
    // ── System ──────────────────────────────────────────────────────────
    { key: 'panels', group: 'design', type: 'range', label: 'Solar panels (440 W each)', min: 12, max: 160, step: 1, def: 92, unit: '' },
    { key: 'batteries', group: 'design', type: 'range', label: 'Batteries (14.3 kWh each)', min: 1, max: 24, step: 1, def: 5, unit: '' },
    { key: 'inverters', group: 'design', type: 'range', label: 'Inverters (at least)', min: 1, max: 8, step: 1, def: 2, unit: '', hint: 'Raised automatically to carry the peak demand and the solar array.' },
    { key: 'roofSharePct', group: 'design', type: 'range', label: 'Panels on the roof', min: 0, max: 100, step: 5, def: 50, unit: '%', hint: 'The rest go on a ground mount: it needs a building permit but no rapid-shutdown devices.' },
    { key: 'maxPanels', group: 'design', type: 'range', label: 'Most panels the site fits', min: 24, max: 160, step: 4, def: 120, unit: '', hint: 'Upper limit for the Optimizer tab.' },
    { key: 'serviceA', group: 'design', type: 'choice', label: 'Electrical service', options: [{ v: 200, t: '200 A' }, { v: 400, t: '400 A' }], def: 400 },

    // ── Home ────────────────────────────────────────────────────────────
    { key: 'springBaseKwh', group: 'load', type: 'range', label: 'Daily use in spring', min: 10, max: 60, step: 1, def: 30, unit: 'kWh', hint: 'The challenge baseline is 30 kWh. Other seasons scale from it.' },
    { key: 'designPeakKw', group: 'load', type: 'range', label: 'Peak demand', min: 5, max: 40, step: 1, def: 15, unit: 'kW', hint: 'The most the house draws at one moment (heat pump, range…). Sets the inverter count.' },
    { key: 'includeIdle', group: 'load', type: 'bool', label: 'Count inverter standby power (65 W each)', def: true },
    { key: 'heaterHoursWinter', group: 'load', type: 'range', label: 'Battery heaters in winter', min: 0, max: 8, step: 0.5, def: 0.5, unit: 'h/day' },

    // ── Solar & weather ─────────────────────────────────────────────────
    { key: 'pvDerate', group: 'solar', type: 'range', label: 'Panel output after losses', min: 0.7, max: 1, step: 0.01, def: 0.88, unit: '×', hint: 'Dirt, wiring and heat. 1.00 would mean no losses.' },
    { key: 'weatherMode', group: 'solar', type: 'choice', label: 'Weather', options: [{ v: 'average', t: 'Seasonal average' }, { v: 'variable', t: 'Day to day' }], def: 'variable' },
    { key: 'weatherSeed', group: 'solar', type: 'range', label: 'Weather year', min: 1, max: 50, step: 1, def: 14, unit: '', hint: 'One of 50 simulated years (day-to-day weather only). Year 14 is a typical one: the middle of the first 20 for generator use.' },
    { key: 'designLowC', group: 'solar', type: 'range', label: 'Coldest morning', min: -30, max: 0, step: 0.5, def: -16, unit: '°C', hint: 'Limits how many panels fit in a string. Victoria\'s record low is −15 °C.' },
    { key: 'designHotCellC', group: 'solar', type: 'range', label: 'Hottest panel temperature', min: 40, max: 85, step: 1, def: 65, unit: '°C' },

    // ── Generator ───────────────────────────────────────────────────────
    { key: 'genStrategy', group: 'generator', type: 'choice', label: 'Start rule', options: [{ v: 'smart', t: 'Forecast-aware' }, { v: 'soc', t: 'Battery level' }], def: 'smart' },
    { key: 'reserveKwh', group: 'generator', type: 'range', label: 'Safety margin', min: 0, max: 20, step: 0.5, def: 4, unit: 'kWh', hint: 'Energy the forecast must still leave in the battery.' },
    { key: 'forecastErrorPct', group: 'generator', type: 'range', label: 'Forecast error', min: 0, max: 60, step: 5, def: 20, unit: '%', hint: 'How far a day-ahead solar forecast typically misses.' },
    { key: 'genMinRunH', group: 'generator', type: 'range', label: 'Shortest run per start', min: 1, max: 6, step: 1, def: 3, unit: 'h', hint: 'Fewer, longer runs mean fewer cold starts.' },
    { key: 'socStartPct', group: 'generator', type: 'range', label: 'Battery-level rule: start at', min: 20, max: 60, step: 1, def: 30, unit: '%' },
    { key: 'socStopPct', group: 'generator', type: 'range', label: 'Battery-level rule: stop at', min: 40, max: 100, step: 1, def: 90, unit: '%' },
    { key: 'genCostPerKwh', group: 'generator', type: 'range', label: 'Fuel cost', min: 0.5, max: 4, step: 0.05, def: 1.65, unit: '$/kWh' },
    { key: 'genServiceCost', group: 'generator', type: 'range', label: 'Service, every 100 kWh', min: 100, max: 800, step: 10, def: 300, unit: '$' },
    { key: 'genReplaceAtEff', group: 'generator', type: 'range', label: 'Replace at efficiency', min: 0.5, max: 0.9, step: 0.01, def: 0.7, unit: '%', pct: true, hint: 'Each service costs 2% efficiency.' },
    { key: 'genReplaceCost', group: 'generator', type: 'range', label: 'Replacement generator', min: 1000, max: 10000, step: 100, def: 3500, unit: '$' },

    // ── Battery & backup ────────────────────────────────────────────────
    { key: 'minSocPct', group: 'battery', type: 'range', label: 'Lowest battery level', min: 5, max: 40, step: 1, def: 20, unit: '%', hint: 'EG4 rates 8,000 cycles when kept above 20%.' },
    { key: 'autonomyDays', group: 'battery', type: 'range', label: 'Backup target, no generator', min: 1, max: 7, step: 1, def: 3, unit: 'days' },
    { key: 'autonomySeason', group: 'battery', type: 'choice', label: 'Season for the backup test', options: [{ v: 'winter', t: 'Winter' }, { v: 'fall', t: 'Fall' }, { v: 'spring', t: 'Spring' }, { v: 'summer', t: 'Summer' }], def: 'winter' },

    // ── Costs ───────────────────────────────────────────────────────────
    { key: 'electricianRate', group: 'finance', type: 'range', label: 'Electrician', min: 80, max: 200, step: 5, def: 125, unit: '$/h' },
    { key: 'installerRate', group: 'finance', type: 'range', label: 'Solar installer', min: 50, max: 150, step: 5, def: 85, unit: '$/h' },
    { key: 'overheadPct', group: 'finance', type: 'range', label: 'Contractor overhead & profit', min: 0, max: 30, step: 1, def: 12, unit: '%' },
    { key: 'contingencyPct', group: 'finance', type: 'range', label: 'Contingency', min: 0, max: 25, step: 1, def: 10, unit: '%' },
    { key: 'freightPct', group: 'finance', type: 'range', label: 'Freight to Vancouver Island', min: 0, max: 10, step: 0.5, def: 3, unit: '%', hint: 'Share of the equipment cost.' },
    { key: 'horizonYears', group: 'finance', type: 'range', label: 'Count costs over', min: 10, max: 30, step: 1, def: 25, unit: 'years' },
    { key: 'discountPct', group: 'finance', type: 'range', label: 'Discount rate', min: 0, max: 10, step: 0.5, def: 4, unit: '%', hint: 'Turns future costs into today\'s dollars.' },
    { key: 'escalationPct', group: 'finance', type: 'range', label: 'Price inflation', min: 0, max: 6, step: 0.5, def: 2, unit: '%/yr' },
    { key: 'inverterReplaceYear', group: 'finance', type: 'range', label: 'Replace inverters in year', min: 8, max: 25, step: 1, def: 13, unit: '' },
    { key: 'batteryReplaceYear', group: 'finance', type: 'range', label: 'Replace batteries in year', min: 10, max: 30, step: 1, def: 16, unit: '' },
    { key: 'omPerYear', group: 'finance', type: 'range', label: 'Inspection & upkeep', min: 0, max: 1500, step: 50, def: 300, unit: '$/yr' },
    { key: 'keepUtility', group: 'finance', type: 'bool', label: 'Keep BC Hydro as standby', def: true }
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
