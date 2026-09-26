/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage UI kit — ui/ui.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Shared formatting, tiny HTML builders and the tab registry. Every tab in
 * ui/tabs/ registers itself here with:
 *
 *   SunUI.tab({
 *     id, title,                 // nav label
 *     intro,                     // one sentence, or function(m) for a live one
 *     html,                      // static card skeleton, inserted once
 *     init(app),                 // optional: wire buttons once
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
  /** [12, 11, 12] → "11–12"; [12, 12] → "12". */
  function span(a) {
    var lo = Math.min.apply(null, a), hi = Math.max.apply(null, a);
    return lo === hi ? String(lo) : lo + '–' + hi;
  }

  // ── HTML builders ──────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  /** A headline number: label, value, one line of context. */
  function kpi(label, value, sub) {
    return '<div class="kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + value + '</div>' +
      (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + '</div>';
  }

  /** One line under a card title saying how to read what follows. */
  function caption(text, id) {
    return '<p class="caption"' + (id ? ' id="' + id + '"' : '') + '>' + (text || '') + '</p>';
  }

  /** A card: title, optional action slot (HTML), body. */
  function card(title, body, action) {
    return '<section class="card"><div class="card-head"><h3>' + title + '</h3>' + (action || '') + '</div>' + body + '</section>';
  }

  /**
   * A table from column specs and rows.
   * cols: [{ t: 'Header', num: true, nowrap: true, cls: 'on' }] · rows: [[cell, …]] · opts.rowClass(i)
   */
  function table(cols, rows, opts) {
    opts = opts || {};
    function cls(c) {
      var k = c ? [c.num ? 'num' : '', c.nowrap ? 'nowrap' : '', c.cls || ''].join(' ').trim() : '';
      return k ? ' class="' + k + '"' : '';
    }
    return '<div class="table-scroll"><table><thead><tr>' +
      cols.map(function (c) { return '<th' + cls(c) + '>' + c.t + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (r, i) {
        var rc = opts.rowClass ? opts.rowClass(i) : '';
        return '<tr' + (rc ? ' class="' + rc + '"' : '') + '>' +
          r.map(function (v, j) { return '<td' + cls(cols[j]) + '>' + v + '</td>'; }).join('') + '</tr>';
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
    money: money, kwh: kwh, pct: pct, n1: n1, esc: esc, sum: sum, span: span,
    $: $, kpi: kpi, caption: caption, card: card, table: table, segmented: segmented,
    tab: tab, tabs: tabs,
    COLORS: {
      solar: 'var(--c-solar)', battery: 'var(--c-battery)', gen: 'var(--c-gen)',
      aqua: 'var(--c-aqua)', load: 'var(--c-load)'
    }
  };
})();
