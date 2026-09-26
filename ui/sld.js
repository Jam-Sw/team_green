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
    var W = 1000, H = 450, gb = d.gridboss;
    var left = 220, colW = (W - 20 - left) / gb;
    var wires = [], boxes = [];

    function box(x, y, w, h, title, sub, cls) {
      boxes.push('<rect class="box ' + (cls || '') + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>');
      boxes.push('<text x="' + (x + w / 2) + '" y="' + (y + (sub ? h / 2 - 3 : h / 2 + 4)) + '" text-anchor="middle">' + title + '</text>');
      if (sub) boxes.push('<text class="small" x="' + (x + w / 2) + '" y="' + (y + h / 2 + 12) + '" text-anchor="middle">' + sub + '</text>');
    }
    function wire(pts, cls) {
      wires.push('<polyline class="wire ' + (cls || '') + '" points="' + pts.map(function (p) { return p.join(','); }).join(' ') + '"/>');
    }

    // Utility chain and generator (left column)
    box(20, 20, 150, 44, 'BC Hydro meter', 'standby, zero export', 'existing');
    box(20, 100, 150, 44, d.serviceA + ' A fused disconnect', 'service entrance', 'new');
    box(20, 180, 150, 44, 'Distribution splitter', 'one leg per GridBOSS', 'new');
    box(20, 300, 150, 44, 'BE7500ID 6 kW', 'existing · 2-wire start', 'existing');
    wire([[95, 64], [95, 100]]);
    wire([[95, 144], [95, 180]]);

    // One column per GridBOSS; inverters and batteries spread across them.
    var invLeft = d.inverters, batPer = Math.floor(d.batteries / d.inverters), batExtra = d.batteries % d.inverters;
    var invIdx = 0, strs = Math.ceil(d.layout.count / d.inverters), batX = [], lastGb = left;
    for (var g = 0; g < gb; g++) {
      var bw = Math.min(300, colW - 40), cx = left + colW * g + (colW - bw) / 2, mid = cx + bw / 2;
      var nInv = Math.ceil(invLeft / (gb - g));
      invLeft -= nInv;
      lastGb = cx;
      box(cx, 20, bw, 44, '200 A panel ' + String.fromCharCode(65 + g), 'house loads', 'new');
      box(cx, 180, bw, 44, 'GridBOSS #' + (g + 1), '200 A · GEN / hybrid ports', 'new');
      wire([[mid, 64], [mid, 180]]);
      if (g === 0) wire([[170, 322], [195, 322], [195, 214], [cx, 214]], 'gen');

      var iw = Math.max(70, (bw - (nInv - 1) * 10) / nInv);
      for (var k = 0; k < nInv; k++) {
        var x = cx + k * (iw + 10), xm = x + iw / 2;
        var bats = batPer + (invIdx < batExtra ? 1 : 0);
        // Narrow boxes (many inverters) swap the name into the small line.
        if (iw >= 110) box(x, 270, iw, 44, 'FlexBOSS21', '#' + (invIdx + 1) + ' · ' + strs + ' PV strings', 'new');
        else box(x, 270, iw, 44, '#' + (invIdx + 1), 'FlexBOSS21', 'new');
        box(x, 360, iw, 44, bats + ' × 280Ah', n1(bats * EQ.battery.energyKwh) + ' kWh', 'new');
        wire([[xm, 224], [xm, 270]]);
        wire([[xm, 314], [xm, 360]], 'bat');
        batX.push(xm);
        invIdx++;
      }
    }
    // Splitter feeds every GridBOSS along one line.
    wire([[170, 202], [lastGb, 202]]);
    // Paralleled inverters share one 48 V bank.
    if (batX.length > 1) {
      batX.forEach(function (x) { wire([[x, 404], [x, 426]], 'bat'); });
      wire([[batX[0], 426], [batX[batX.length - 1], 426]], 'bat');
    }
    // Wires first, so boxes sit on top and no line crosses a label.
    var svg = wires.concat(boxes);

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
