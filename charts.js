/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage Charts — charts.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Small dependency-free SVG charts: stacked bars (+ optional line overlay on
 * the same axis), single line/area, and a heatmap. Every chart gets a hover
 * tooltip and a legend when it has more than one series.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

window.SunCharts = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var PAD = { top: 24, right: 16, bottom: 30, left: 52 };

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var m = v / p;
    var step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return step * p;
  }

  function fmt(v, digits) {
    if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString();
    return v.toFixed(digits == null ? 1 : digits);
  }

  // ── Shared tooltip ─────────────────────────────────────────────────────
  var tip;
  function tooltip() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tip';
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    return tip;
  }
  function showTip(evt, html) {
    var t = tooltip();
    t.innerHTML = html;
    t.hidden = false;
    var x = evt.clientX + 14, y = evt.clientY + 14;
    var w = t.offsetWidth, h = t.offsetHeight;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - 14;
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  }
  function hideTip() { tooltip().hidden = true; }

  function legend(container, series) {
    if (series.length < 2) return;
    var lg = document.createElement('div');
    lg.className = 'chart-legend';
    series.forEach(function (s) {
      var item = document.createElement('span');
      item.className = 'legend-item';
      item.innerHTML = '<i class="swatch' + (s.line ? ' swatch-line' : '') + '" style="--c:' + s.color + '"></i>' + s.name;
      lg.appendChild(item);
    });
    container.appendChild(lg);
  }

  function frame(container, height) {
    container.innerHTML = '';
    var width = Math.max(280, container.clientWidth || 600);
    var svg = el('svg', { viewBox: '0 0 ' + width + ' ' + height, width: '100%', height: height, role: 'img' });
    container.appendChild(svg);
    return { svg: svg, width: width, height: height,
             iw: width - PAD.left - PAD.right, ih: height - PAD.top - PAD.bottom };
  }

  function yAxis(f, max, unit) {
    var g = el('g', { class: 'axis' }, f.svg);
    for (var i = 0; i <= 4; i++) {
      var v = max * i / 4;
      var y = PAD.top + f.ih - f.ih * i / 4;
      el('line', { x1: PAD.left, x2: PAD.left + f.iw, y1: y, y2: y, class: i === 0 ? 'baseline' : 'grid' }, g);
      var t = el('text', { x: PAD.left - 6, y: y + 4, 'text-anchor': 'end' }, g);
      t.textContent = fmt(v, max < 5 ? 1 : 0);
    }
    if (unit) {
      var u = el('text', { x: 4, y: 10, class: 'unit' }, g);
      u.textContent = unit;
    }
  }

  /**
   * Stacked bar chart.
   * opts: { labels[], series:[{name,color,values[]}], line:{name,color,values[]},
   *         unit, height, labelEvery, tipTitle(i) }
   */
  function stackedBars(container, opts) {
    var f = frame(container, opts.height || 260);
    var n = opts.labels.length;
    var totals = opts.labels.map(function (_, i) {
      return opts.series.reduce(function (a, s) { return a + Math.max(0, s.values[i]); }, 0);
    });
    var max = Math.max.apply(null, totals);
    if (opts.line) max = Math.max(max, Math.max.apply(null, opts.line.values));
    max = niceMax(max * 1.05);
    yAxis(f, max, opts.unit);

    var slot = f.iw / n;
    var bw = Math.max(2, Math.min(40, slot * 0.72));
    var sy = function (v) { return f.ih * v / max; };
    var bars = el('g', {}, f.svg);
    // Skip labels when bars get narrow (phones), so they never run together.
    var longest = Math.max.apply(null, opts.labels.map(function (l) { return String(l).length; }));
    var every = Math.max(opts.labelEvery || 1, Math.ceil((longest * 7 + 8) / slot));

    for (var i = 0; i < n; i++) {
      var x = PAD.left + slot * i + (slot - bw) / 2;
      var y = PAD.top + f.ih;
      var top = null;
      opts.series.forEach(function (s) {
        var h = sy(Math.max(0, s.values[i]));
        if (h <= 0) return;
        // 2px surface gap between stacked segments
        var gap = top === null ? 0 : 1;
        top = el('rect', { x: x, y: y - h + gap, width: bw, height: Math.max(0, h - gap), fill: s.color, class: 'bar' }, bars);
        y -= h;
      });
      if (i % every === 0) {
        var lt = el('text', { x: PAD.left + slot * i + slot / 2, y: PAD.top + f.ih + 18, 'text-anchor': 'middle', class: 'xlabel' }, f.svg);
        lt.textContent = opts.labels[i];
      }
      // hit target: full column
      (function (i) {
        var hit = el('rect', { x: PAD.left + slot * i, y: PAD.top, width: slot, height: f.ih, class: 'hit' }, f.svg);
        hit.addEventListener('mousemove', function (e) {
          var rows = opts.series.map(function (s) {
            return '<div><i class="swatch" style="--c:' + s.color + '"></i>' + s.name + ': <b>' + fmt(s.values[i]) + '</b> ' + (opts.unit || '') + '</div>';
          });
          if (opts.line) rows.push('<div><i class="swatch swatch-line" style="--c:' + opts.line.color + '"></i>' + opts.line.name + ': <b>' + fmt(opts.line.values[i]) + '</b> ' + (opts.unit || '') + '</div>');
          showTip(e, '<div class="tip-title">' + (opts.tipTitle ? opts.tipTitle(i) : opts.labels[i]) + '</div>' + rows.join(''));
        });
        hit.addEventListener('mouseleave', hideTip);
      })(i);
    }

    if (opts.line) {
      var pts = opts.line.values.map(function (v, i) {
        return (PAD.left + slot * i + slot / 2) + ',' + (PAD.top + f.ih - sy(v));
      }).join(' ');
      el('polyline', { points: pts, fill: 'none', stroke: opts.line.color, 'stroke-width': 2, class: 'overlay-line' }, f.svg);
    }
    legend(container, opts.series.concat(opts.line ? [Object.assign({ line: true }, opts.line)] : []));
  }

  /**
   * Line / area chart for long series (e.g. 8760 SOC values).
   * opts: { values[], color, unit, height, max, xTicks:[{i,label}], tip(i) , area }
   */
  function line(container, opts) {
    var f = frame(container, opts.height || 180);
    var n = opts.values.length;
    var max = opts.max || niceMax(Math.max.apply(null, opts.values) * 1.05);
    yAxis(f, max, opts.unit);
    var sx = function (i) { return PAD.left + f.iw * i / (n - 1); };
    var sy = function (v) { return PAD.top + f.ih - f.ih * v / max; };
    // Downsample to ~2 points per pixel column.
    var stride = Math.max(1, Math.floor(n / (f.iw * 2)));
    var pts = [];
    for (var i = 0; i < n; i += stride) pts.push(sx(i).toFixed(1) + ',' + sy(opts.values[i]).toFixed(1));
    if (opts.area) {
      el('polygon', { points: PAD.left + ',' + (PAD.top + f.ih) + ' ' + pts.join(' ') + ' ' + sx(n - 1) + ',' + (PAD.top + f.ih),
                      fill: opts.color, 'fill-opacity': 0.18 }, f.svg);
    }
    el('polyline', { points: pts.join(' '), fill: 'none', stroke: opts.color, 'stroke-width': 1.5 }, f.svg);
    (opts.xTicks || []).forEach(function (tk) {
      var t = el('text', { x: sx(tk.i), y: PAD.top + f.ih + 18, 'text-anchor': 'middle', class: 'xlabel' }, f.svg);
      t.textContent = tk.label;
    });
    var cross = el('line', { y1: PAD.top, y2: PAD.top + f.ih, class: 'crosshair', visibility: 'hidden' }, f.svg);
    var hit = el('rect', { x: PAD.left, y: PAD.top, width: f.iw, height: f.ih, class: 'hit' }, f.svg);
    hit.addEventListener('mousemove', function (e) {
      var r = f.svg.getBoundingClientRect();
      var px = (e.clientX - r.left) * f.width / r.width;
      var i = Math.max(0, Math.min(n - 1, Math.round((px - PAD.left) / f.iw * (n - 1))));
      cross.setAttribute('x1', sx(i)); cross.setAttribute('x2', sx(i));
      cross.setAttribute('visibility', 'visible');
      showTip(e, opts.tip ? opts.tip(i) : fmt(opts.values[i]));
    });
    hit.addEventListener('mouseleave', function () { hideTip(); cross.setAttribute('visibility', 'hidden'); });
  }

  /**
   * Heatmap: rows × cols of values, sequential single-hue ramp (low = light).
   * opts: { rows[], cols[], value(r,c) → number|null, highlight:{r,c}, tip(r,c), onClick(r,c), rowTitle, colTitle }
   */
  var RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
  function heatmap(container, opts) {
    var cellH = 18;
    var height = PAD.top + opts.rows.length * cellH + 44;
    var f = frame(container, height);
    var cw = f.iw / opts.cols.length;
    var vals = [];
    opts.rows.forEach(function (_, r) { opts.cols.forEach(function (_, c) {
      var v = opts.value(r, c); if (v != null) vals.push(v);
    }); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    // Optional cap so a few extreme cells don't wash out the region of interest.
    if (opts.capRatio) hi = Math.min(hi, lo * opts.capRatio);
    var g = el('g', {}, f.svg);
    opts.rows.forEach(function (rl, r) {
      var y = PAD.top + r * cellH;
      var t = el('text', { x: PAD.left - 6, y: y + cellH / 2 + 4, 'text-anchor': 'end', class: 'xlabel' }, g);
      t.textContent = rl;
      opts.cols.forEach(function (_, c) {
        var v = opts.value(r, c);
        var x = PAD.left + c * cw;
        var fill;
        if (v == null) fill = 'var(--cell-empty)';
        else {
          var k = hi === lo ? 0 : Math.min(1, (v - lo) / (hi - lo));
          fill = RAMP[Math.min(RAMP.length - 1, Math.floor(k * RAMP.length))];
        }
        var rect = el('rect', { x: x + 1, y: y + 1, width: Math.max(1, cw - 2), height: cellH - 2, rx: 2, fill: fill, class: 'cell' }, g);
        if (opts.highlight && opts.highlight.r === r && opts.highlight.c === c) {
          rect.setAttribute('class', 'cell best');
        }
        rect.addEventListener('mousemove', function (e) { showTip(e, opts.tip(r, c)); });
        rect.addEventListener('mouseleave', hideTip);
        if (opts.onClick) rect.addEventListener('click', function () { opts.onClick(r, c); });
      });
    });
    var every = Math.ceil(opts.cols.length / 14);
    opts.cols.forEach(function (cl, c) {
      if (c % every) return;
      var t = el('text', { x: PAD.left + c * cw + cw / 2, y: PAD.top + opts.rows.length * cellH + 16, 'text-anchor': 'middle', class: 'xlabel' }, f.svg);
      t.textContent = cl;
    });
    var ct = el('text', { x: PAD.left + f.iw / 2, y: height - 4, 'text-anchor': 'middle', class: 'unit' }, f.svg);
    ct.textContent = opts.colTitle || '';
    var rt = el('text', { x: 4, y: 10, class: 'unit' }, f.svg);
    rt.textContent = opts.rowTitle || '';
    var scale = document.createElement('div');
    scale.className = 'heat-scale';
    scale.innerHTML = '<span>' + opts.fmt(lo) + '</span><span class="heat-ramp">' +
      RAMP.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') +
      '</span><span>' + opts.fmt(hi) + (opts.capRatio ? '+' : '') + '</span><span class="heat-empty"><i></i> ' + (opts.emptyLabel || 'n/a') + '</span>';
    container.appendChild(scale);
  }

  return { stackedBars: stackedBars, line: line, heatmap: heatmap, fmt: fmt };
})();
