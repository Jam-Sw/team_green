/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage settings panel — ui/controls.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Builds one input per SunSettings.SCHEMA field, grouped by SunSettings.GROUPS.
 * Adding a field to the schema adds it here; nothing in this file changes.
 *
 *   SunControls.render(panel, settings, onChange(key, value))
 *   SunControls.refresh(settings, design)   // update the value read-outs
 *   SunControls.setMarks({ key: [{ v, label, title, on }] })  // tier markers under sliders
 * ═══════════════════════════════════════════════════════════════════════════════
 */

window.SunControls = (function () {
  'use strict';

  var S = window.SunSettings, U = window.SunUI;
  var marks = {};

  function render(panel, settings, onChange) {
    panel.innerHTML = '';
    S.GROUPS.forEach(function (g, gi) {
      var group = document.createElement('details');
      group.className = 'ctl-group';
      group.open = gi === 0;
      group.innerHTML = '<summary>' + g.title + '</summary><p class="group-hint">' + g.hint + '</p>';
      S.SCHEMA.filter(function (f) { return f.group === g.id; }).forEach(function (f) {
        group.appendChild(field(f, settings[f.key], onChange));
      });
      panel.appendChild(group);
    });
    S.SCHEMA.forEach(drawMarks);
  }

  /** Replace the markers under the sliders (e.g. where each tier sits). */
  function setMarks(next) {
    marks = next || {};
    S.SCHEMA.forEach(drawMarks);
  }

  function drawMarks(f) {
    var input = U.$('ctl-' + f.key);
    if (!input || f.type !== 'range') return;
    var box = input.parentNode.querySelector('.ticks');
    var list = marks[f.key] || [];
    if (!list.length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.className = 'ticks';
      input.insertAdjacentElement('afterend', box);
    }
    // Markers at the same value share one label ("3 4").
    var at = {};
    list.forEach(function (m) { (at[m.v] = at[m.v] || []).push(m); });
    box.innerHTML = Object.keys(at).map(function (v) {
      var ms = at[v], on = ms.some(function (m) { return m.on; });
      return '<span class="tick' + (on ? ' on' : '') + '" style="left:' + ((v - f.min) / (f.max - f.min) * 100) + '%" title="' +
        ms.map(function (m) { return m.title; }).join('; ') + '">' + ms.map(function (m) { return m.label; }).join(' ') + '</span>';
    }).join('');
  }

  function field(f, v, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'ctl';
    var hint = f.hint ? '<p class="ctl-hint">' + f.hint + '</p>' : '';

    if (f.type === 'range') {
      wrap.innerHTML =
        '<label class="ctl-label" for="ctl-' + f.key + '"><span>' + f.label + '</span><output id="val-' + f.key + '"></output></label>' +
        '<input type="range" id="ctl-' + f.key + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + v + '">' + hint;
      var input = wrap.querySelector('input');
      input.addEventListener('input', function () { onChange(f.key, input.value); });
    } else if (f.type === 'choice') {
      wrap.innerHTML = '<div class="ctl-label"><span>' + f.label + '</span></div><div class="seg"></div>' + hint;
      U.segmented(wrap.querySelector('.seg'), f.options, v, function (val) { onChange(f.key, val); });
    } else if (f.type === 'bool') {
      wrap.innerHTML = '<label class="switch"><input type="checkbox" id="ctl-' + f.key + '"' + (v ? ' checked' : '') + '> ' + f.label + '</label>' + hint;
      var cb = wrap.querySelector('input');
      cb.addEventListener('change', function () { onChange(f.key, cb.checked); });
    }
    return wrap;
  }

  /** A slider value with its unit: 92 · 0.88 × · −16.0 °C · 50% · $3,500 · $1.65/kWh */
  function format(f, v) {
    if (f.pct) return Math.round(v * 100) + '%';
    var n = (f.step < 1 ? Number(v).toFixed(f.step < 0.1 ? 2 : 1) : Number(v).toLocaleString()).replace('-', '−');
    var unit = f.unit || '';
    if (unit.charAt(0) === '$') return '$' + n + unit.slice(1);
    if (unit.charAt(0) === '%') return n + unit;
    return unit ? n + ' ' + unit : n;
  }

  /** Show each slider's value; flag counts the datasheet minimums raised. */
  function refresh(settings, design) {
    var raised = { batteries: design.batteries, inverters: design.inverters };
    S.SCHEMA.forEach(function (f) {
      var out = U.$('val-' + f.key);
      if (!out) return;
      var v = settings[f.key];
      var txt = format(f, v);
      var actual = raised[f.key];
      var adjusted = actual != null && actual !== v;
      out.textContent = adjusted ? v + ' → ' + actual : txt;
      out.classList.toggle('adjusted', adjusted);
      out.title = adjusted ? 'Raised automatically: the design needs at least ' + actual : '';
    });
  }

  return { render: render, refresh: refresh, setMarks: setMarks };
})();
