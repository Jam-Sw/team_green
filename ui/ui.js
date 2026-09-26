/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage UI kit — ui/ui.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Shared formatting, tiny HTML builders and the tab registry. Every tab in
 * ui/tabs/ registers itself here with:
 *
 *   SunUI.tab({
 *     id, title, intro,          // nav label + one-line "what this shows"
 *     html,                      // static card skeleton, inserted once
 *     render(m, app)             // fill the skeleton from the model
 *   })
 *
 * `m` is the current model (settings, design, simulation, budget) built by
 * app.js; `app` exposes the few actions a tab may trigger (load a design,
 * re-render).
 * ═══════════════════════════════════════════════════════════════════════════════
 */

window.SunUI = (function () {
  'use strict';

  // ── Formatting ─────────────────────────────────────────────────────────
  function money(v) { return '$' + Math.round(v).toLocaleString(); }
  function kwh(v) { return Math.round(v).toLocaleString() + ' kWh'; }
  function pct(v) { return (v * 100).toFixed(0) + '%'; }
  function n1(v) { return v.toFixed(1); }
  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function sum(arr, fn) { return arr.reduce(function (a, x) { return a + (fn ? fn(x) : x); }, 0); }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }).join('/'); }

  // ── HTML builders ──────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  /** A headline number: label, value, one line of context. */
  function kpi(label, value, sub) {
    return '<div class="kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + value + '</div>' +
      (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + '</div>';
  }

  /** A card: title, optional action slot (HTML), body. */
  function card(title, body, action) {
    return '<section class="card"><div class="card-head"><h3>' + title + '</h3>' + (action || '') + '</div>' + body + '</section>';
  }

  /**
   * A table from column specs and rows.
   * cols: [{ t: 'Header', num: true }] · rows: [[cell, …]] · opts.rowClass(i)
   */
  function table(cols, rows, opts) {
    opts = opts || {};
    return '<div class="table-scroll"><table><thead><tr>' +
      cols.map(function (c) { return '<th' + (c.num ? ' class="num"' : '') + '>' + c.t + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (r, i) {
        var cls = opts.rowClass ? opts.rowClass(i) : '';
        return '<tr' + (cls ? ' class="' + cls + '"' : '') + '>' +
          r.map(function (v, j) { return '<td' + (cols[j] && cols[j].num ? ' class="num"' : '') + '>' + v + '</td>'; }).join('') + '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  /** Segmented buttons. Calls onPick(value) on click. */
  function segmented(el, options, active, onPick) {
    el.innerHTML = '';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.t;
      if (String(o.v) === String(active)) b.className = 'active';
      b.addEventListener('click', function () {
        el.querySelectorAll('button').forEach(function (x) { x.className = ''; });
        b.className = 'active';
        onPick(o.v);
      });
      el.appendChild(b);
    });
  }

  // ── Tab registry ───────────────────────────────────────────────────────
  var tabs = [];
  function tab(def) { tabs.push(def); }

  return {
    money: money, kwh: kwh, pct: pct, n1: n1, esc: esc, sum: sum, uniq: uniq,
    $: $, kpi: kpi, card: card, table: table, segmented: segmented,
    tab: tab, tabs: tabs,
    COLORS: {
      solar: 'var(--c-solar)', battery: 'var(--c-battery)', gen: 'var(--c-gen)',
      aqua: 'var(--c-aqua)', load: 'var(--c-load)'
    }
  };
})();
