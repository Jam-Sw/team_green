/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage single-line diagram — ui/sld.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Draws the proposed wiring as SVG from the design counts:
 *
 *   BC Hydro meter → 400 A disconnect → splitter ─┬─ GridBOSS #1 → 200 A panel A
 *                                                 └─ GridBOSS #2 → 200 A panel B
 *   each GridBOSS ← FlexBOSS21 inverter(s) ← shared 48 V battery bank
 *   generator → GridBOSS #1 GEN port
 * ═══════════════════════════════════════════════════════════════════════════════
 */

window.SunSld = (function () {
  'use strict';

  var EQ = window.SunData.EQUIPMENT, n1 = window.SunUI.n1;

  function render(el, d) {
    var W = 1000, H = 440, gb = d.gridboss;
    var colW = (W - 360) / gb;
    var svg = [];

    function box(x, y, w, h, title, sub, cls) {
      svg.push('<rect class="box ' + (cls || '') + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>');
      svg.push('<text x="' + (x + w / 2) + '" y="' + (y + (sub ? h / 2 - 3 : h / 2 + 4)) + '" text-anchor="middle">' + title + '</text>');
      if (sub) svg.push('<text class="small" x="' + (x + w / 2) + '" y="' + (y + h / 2 + 12) + '" text-anchor="middle">' + sub + '</text>');
    }
    function wire(pts, cls) {
      svg.push('<polyline class="wire ' + (cls || '') + '" points="' + pts.map(function (p) { return p.join(','); }).join(' ') + '"/>');
    }

    // Utility chain and generator (left column)
    box(20, 20, 130, 44, 'BC Hydro meter', 'standby, zero export', 'existing');
    box(20, 100, 130, 44, '400 A fused disc.', 'service entrance', 'new');
    box(20, 180, 130, 44, 'Distribution splitter', 'one leg per GridBOSS', 'new');
    wire([[85, 64], [85, 100]]);
    wire([[85, 144], [85, 180]]);
    box(20, 300, 130, 44, 'BE7500ID 6 kW', 'existing · 2-wire start', 'existing');

    // One column per GridBOSS, inverters and batteries spread across them.
    var invLeft = d.inverters, batPer = Math.floor(d.batteries / d.inverters), batExtra = d.batteries % d.inverters;
    var invIdx = 0, strs = Math.ceil(d.layout.count / d.inverters);
    for (var g = 0; g < gb; g++) {
      var cx = 200 + colW * g, bw = Math.min(200, colW - 30);
      var nInv = Math.ceil(invLeft / (gb - g));
      invLeft -= nInv;
      box(cx, 180, bw, 44, 'GridBOSS #' + (g + 1), '200 A · GEN / hybrid ports', 'new');
      box(cx, 20, bw, 44, '200 A panel ' + String.fromCharCode(65 + g), 'house loads', 'new');
      wire([[150, 202], [cx, 202]]);
      wire([[cx + bw / 2, 180], [cx + bw / 2, 64]]);
      if (g === 0) wire([[150, 322], [175, 322], [175, 214], [cx, 214]], 'gen');
      var iw = Math.max(60, (bw - (nInv - 1) * 8) / nInv);
      for (var k = 0; k < nInv; k++) {
        var x = cx + k * (iw + 8);
        var bats = batPer + (invIdx < batExtra ? 1 : 0);
        box(x, 270, iw, 44, 'FlexBOSS21', '#' + (invIdx + 1) + ' · ☀ ' + strs + ' str', 'new');
        wire([[x + iw / 2, 270], [x + iw / 2, 224]]);
        box(x, 360, iw, 44, bats + ' × 280Ah', n1(bats * EQ.battery.energyKwh) + ' kWh', 'new');
        wire([[x + iw / 2, 314], [x + iw / 2, 360]], 'bat');
        invIdx++;
      }
    }
    // Paralleled inverters share one 48 V bank.
    if (d.inverters > 1) wire([[220, 414], [200 + colW * (gb - 1) + Math.min(200, colW - 30) - 20, 414]], 'bat');

    el.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Single-line diagram">' + svg.join('') + '</svg>' +
      '<div class="chart-legend">' +
        '<span class="legend-item"><i class="swatch swatch-box"></i>new</span>' +
        '<span class="legend-item"><i class="swatch swatch-box existing"></i>existing</span>' +
        '<span class="legend-item"><i class="swatch swatch-line" style="--c:var(--c-battery)"></i>shared 48 V battery bus</span>' +
        '<span class="legend-item"><i class="swatch swatch-line" style="--c:var(--c-gen)"></i>generator feed</span>' +
      '</div>' +
      '<p class="muted">The existing emergency-loads panel is re-fed from panel A; the manual transfer switch is retired (GridBOSS handles source transfer).</p>';
  }

  return { render: render };
})();
