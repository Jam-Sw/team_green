/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage single-line diagram — ui/sld.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Draws the proposed wiring as a blueprint sheet, built from the design counts:
 *
 *   1 sun → FlexBOSS21 inverters        4 GridBOSS → 200 A panels → house
 *   2 inverters ↔ shared 48 V battery   5 generator → GridBOSS GEN port
 *   3 inverters → GridBOSS (AC)         6 off-grid distribution + bonding
 *
 * Every element carries data-step="n"; the step list under the drawing
 * highlights one step at a time.
 *
 * Drawing order matters: sheet → wires → cast shadows → boxes → callouts,
 * so no line ever crosses a label.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

window.SunSld = (function () {
  'use strict';

  var EQ = window.SunData.EQUIPMENT, n1 = window.SunUI.n1;

  var STEPS = [
    { t: 'Sun → inverters', d: 'Panel strings feed each FlexBOSS21 inverter, which turns sunlight into usable power.' },
    { t: 'Inverters ↔ battery', d: 'Each inverter has a 350 A Class-T fuse on its battery positive lead; all inverters share one 48 V battery bank. Final cable and fuse sizing needs electrical design.' },
    { t: 'Inverters → GridBOSS', d: 'Inverter output meets at the GridBOSS, which picks the power source for the house.' },
    { t: 'GridBOSS → house', d: 'Each GridBOSS feeds one 200 A panel, so the full service stays available.' },
    { t: 'Generator backup', d: 'The existing generator plugs into the GridBOSS and starts itself only when the forecast says the battery will fall short. Its neutral remains floating.' },
    { t: 'Off-grid distribution', d: 'There is no utility connection. Two 200 A GridBOSS legs feed the 400 A home distribution; the final design makes one neutral–ground bond at the off-grid main disconnect.' }
  ];

  function render(el, d) {
    var W = 1000, H = 540, gb = d.gridboss;
    var left = 240, colW = (980 - left) / gb;
    var layers = { wires: [], shadows: [], boxes: [], marks: [] };

    // ── Primitives ──────────────────────────────────────────────────────
    function box(step, x, y, w, h, title, sub, cls) {
      var dz = 7; // depth of the oblique projection
      layers.shadows.push('<polygon data-step="' + step + '" class="cast" points="' +
        [[x + w, y], [x + w + dz, y + dz], [x + w + dz, y + h + dz], [x + dz, y + h + dz], [x, y + h]].map(function (p) { return p.join(','); }).join(' ') + '"/>');
      layers.boxes.push('<g data-step="' + step + '" class="part ' + (cls || '') + '">' +
        '<rect class="box" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>' +
        '<text class="t' + (title.length * 7.6 > w - 12 ? ' fit' : '') + '" x="' + (x + w / 2) + '" y="' + (y + (sub ? h / 2 - 3 : h / 2 + 4)) + '">' + title + '</text>' +
        (sub ? '<text class="s" x="' + (x + w / 2) + '" y="' + (y + h / 2 + 12) + '">' + sub + '</text>' : '') +
        '</g>');
    }
    function wire(step, pts, cls, label, lx, ly) {
      layers.wires.push('<g data-step="' + step + '"><polyline class="wire ' + (cls || '') + '" points="' +
        pts.map(function (p) { return p.join(','); }).join(' ') + '"/>' +
        (label ? '<text class="wl" x="' + lx + '" y="' + ly + '"' + (cls === 'gen' ? ' transform="rotate(-90 ' + lx + ' ' + ly + ')"' : '') + '>' + label + '</text>' : '') + '</g>');
    }
    function mark(step, x, y) {
      layers.marks.push('<g data-step="' + step + '" class="mark"><circle cx="' + x + '" cy="' + y + '" r="10"/>' +
        '<text x="' + x + '" y="' + (y + 4) + '">' + step + '</text></g>');
    }

    // ── 6 Off-grid distribution note and 5 generator (left column) ─────
    box(6, 30, 120, 150, 44, d.serviceA + ' A MAIN', 'off-grid · one N–G bond');
    box(6, 30, 200, 150, 44, 'DISTRIBUTION', 'two 200 A legs');
    box(5, 30, 330, 150, 44, 'BE7500ID 6 kW', 'existing · neutral floating', 'existing');
    wire(6, [[105, 164], [105, 200]]);
    mark(6, 30, 120);
    mark(5, 30, 330);

    // ── One column per GridBOSS; inverters and batteries spread across ──
    var invLeft = d.inverters, batPer = Math.floor(d.batteries / d.inverters), batExtra = d.batteries % d.inverters;
    var invIdx = 0, strs = Math.ceil(d.layout.count / d.inverters), batX = [], lastGb = left;
    for (var g = 0; g < gb; g++) {
      var bw = Math.min(300, colW - 40), cx = left + colW * g + (colW - bw) / 2, mid = cx + bw / 2;
      var nInv = Math.ceil(invLeft / (gb - g));
      invLeft -= nInv;
      lastGb = cx;
      box(4, cx, 40, bw, 44, '200 A PANEL ' + String.fromCharCode(65 + g), 'house loads');
      box(3, cx, 200, bw, 44, 'GRIDBOSS #' + (g + 1), '200 A · GEN / hybrid ports');
      wire(4, [[mid, 84], [mid, 200]]);
      if (g === 0) {
        wire(5, [[180, 352], [210, 352], [210, 234], [cx, 234]], 'gen', 'GEN 240 V', 204, 330);
        mark(4, cx, 40);
        mark(3, cx, 200);
      }

      var iw = Math.max(70, (bw - (nInv - 1) * 10) / nInv);
      for (var k = 0; k < nInv; k++) {
        var x = cx + k * (iw + 10), xm = x + iw / 2;
        var bats = batPer + (invIdx < batExtra ? 1 : 0);
        // Narrow boxes (many inverters) swap the name into the small line.
        if (iw >= 130) box(1, x, 290, iw, 44, 'FLEXBOSS21 #' + (invIdx + 1), strs + ' PV strings');
        else box(1, x, 290, iw, 44, '#' + (invIdx + 1), 'FlexBOSS21');
        box(2, x, 380, iw, 44, bats + ' × 280Ah', n1(bats * EQ.battery.energyKwh) + ' kWh');
        wire(3, [[xm, 244], [xm, 290]], '', invIdx === 0 ? '240 V AC' : '', xm + 6, 272);
        wire(2, [[xm, 334], [xm, 380]], 'bat', '350 A CLASS-T', xm + 6, 363);
        if (invIdx === 0) { mark(1, x, 290); mark(2, x, 380); }
        batX.push(xm);
        invIdx++;
      }
    }
    // 6 Distribution note; GridBOSS load outputs feed the two house panels.
    // 2 Paralleled inverters share one 48 V bank.
    batX.forEach(function (x) { wire(2, [[x, 424], [x, 448]], 'bat'); });
    if (batX.length > 1) wire(2, [[batX[0], 448], [batX[batX.length - 1], 448]], 'bat', '48 V DC BUS', batX[0] + 6, 462);

    el.innerHTML =
      '<div class="blueprint">' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Single-line diagram, blueprint">' +
          defs() + sheet(W, H) + titleBlock(d, W, H) + legend(H) +
          layers.wires.join('') + layers.shadows.join('') + layers.boxes.join('') + layers.marks.join('') +
        '</svg>' +
      '</div>' +
      '<ol class="bp-steps">' + STEPS.map(function (s, i) {
        return '<li><button type="button" data-step="' + (i + 1) + '"><span class="bp-n">' + (i + 1) + '</span>' +
          '<b>' + s.t + '</b><span>' + s.d + '</span></button></li>';
      }).join('') + '</ol>' +
      '<p class="muted">This concept has no utility connection. The existing emergency-loads panel is re-fed from panel A; the manual transfer switch is retired (GridBOSS handles source transfer). 2/0 Cu (175 A) is shown only as a preliminary cable concept; a licensed electrical designer must coordinate conductor ampacity, parallel conductors and the 350 A Class-T fuse. Make one neutral–ground bond at the listed off-grid main disconnect; confirm the generator neutral configuration with its manual.</p>';

    wireSteps(el);
  }

  // ── Sheet: grid, projector hotspot, dithered falloff, border ──────────
  function defs() {
    return '<defs>' +
      // Drafting grid: minor 10, major 50.
      '<pattern id="bp-minor" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" class="grid-minor"/></pattern>' +
      '<pattern id="bp-major" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="url(#bp-minor)"/><path d="M50 0H0V50" class="grid-major"/></pattern>' +
      // Ordered (Bayer 4×4) dither: two strong and two faint dots per cell.
      '<pattern id="bp-dither" width="4" height="4" patternUnits="userSpaceOnUse">' +
        '<rect x="0" y="0" width="1" height="1" class="dot"/><rect x="2" y="2" width="1" height="1" class="dot"/>' +
        '<rect x="2" y="0" width="1" height="1" class="dot dim"/><rect x="0" y="2" width="1" height="1" class="dot dim"/></pattern>' +
      // Projector hotspot, and a ring mask so the dither only shows in the falloff.
      '<radialGradient id="bp-hot" cx="50%" cy="45%" r="65%"><stop offset="0" class="hot-0"/><stop offset="1" class="hot-1"/></radialGradient>' +
      '<radialGradient id="bp-ring" cx="50%" cy="45%" r="70%"><stop offset=".35" stop-color="#000"/><stop offset=".75" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>' +
      '<mask id="bp-falloff"><rect width="100%" height="100%" fill="url(#bp-ring)"/></mask>' +
      // Drafting hatch for cast shadows.
      '<pattern id="bp-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V5" class="hatch"/></pattern>' +
      // Emboss: light from the top-left raises each part off the sheet.
      '<filter id="bp-emboss" x="-5%" y="-10%" width="110%" height="130%">' +
        '<feGaussianBlur in="SourceAlpha" stdDeviation="1.4" result="blur"/>' +
        '<feSpecularLighting in="blur" surfaceScale="2.5" specularConstant=".7" specularExponent="16" lighting-color="#cfe8ff" result="spec">' +
          '<feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>' +
        '<feComposite in="spec" in2="SourceAlpha" operator="in" result="lit"/>' +
        '<feComposite in="SourceGraphic" in2="lit" operator="arithmetic" k2="1" k3=".45"/>' +
      '</filter>' +
    '</defs>';
  }

  function sheet(W, H) {
    return '<rect class="paper" width="' + W + '" height="' + H + '"/>' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#bp-hot)"/>' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#bp-major)"/>' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#bp-dither)" mask="url(#bp-falloff)"/>' +
      '<rect class="border" x="8" y="8" width="' + (W - 16) + '" height="' + (H - 16) + '"/>' +
      '<rect class="border thin" x="14" y="14" width="' + (W - 28) + '" height="' + (H - 28) + '"/>';
  }

  function titleBlock(d, W, H) {
    var x = W - 334, y = H - 84, w = 320, h = 70;
    return '<g class="title-block">' +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>' +
      '<path d="M' + x + ' ' + (y + 30) + 'H' + (x + w) + 'M' + (x + 200) + ' ' + (y + 30) + 'V' + (y + h) + '"/>' +
      '<text class="tb-title" x="' + (x + 10) + '" y="' + (y + 20) + '">SINGLE-LINE DIAGRAM · OFF-GRID PV + STORAGE</text>' +
      '<text x="' + (x + 10) + '" y="' + (y + 46) + '">' + d.serviceA + ' A SERVICE · VICTORIA, BC</text>' +
      '<text x="' + (x + 10) + '" y="' + (y + 62) + '">' + d.panels + ' × 440 W · ' + d.inverters + ' INV · ' + d.batteries + ' BATT</text>' +
      '<text x="' + (x + 210) + '" y="' + (y + 46) + '">DWG  SLD-01</text>' +
      '<text x="' + (x + 210) + '" y="' + (y + 62) + '">REV  A · NTS</text>' +
    '</g>';
  }

  function legend(H) {
    var x = 30, y = H - 84;
    function row(i, sample, label) {
      return '<g transform="translate(' + (x + 10) + ',' + (y + 14 + i * 15) + ')">' + sample + '<text x="34" y="4">' + label + '</text></g>';
    }
    return '<g class="legend">' +
      '<rect x="' + x + '" y="' + y + '" width="190" height="70"/>' +
      row(0, '<rect class="box" x="0" y="-5" width="24" height="10"/>', 'NEW EQUIPMENT') +
      row(1, '<rect class="box existing-s" x="0" y="-5" width="24" height="10"/>', 'EXISTING, REUSED') +
      row(2, '<path class="wire bat" d="M0 0H24"/>', '48 V DC BATTERY BUS') +
      row(3, '<path class="wire gen" d="M0 0H24"/>', 'GENERATOR FEED') +
    '</g>';
  }

  // ── Step list ↔ drawing highlight ─────────────────────────────────────
  function wireSteps(el) {
    var bp = el.querySelector('.blueprint');
    var pinned = null;
    function focus(step) {
      bp.classList.toggle('focus', !!step);
      bp.querySelectorAll('[data-step]').forEach(function (n) { n.classList.toggle('on', n.getAttribute('data-step') === step); });
      el.querySelectorAll('.bp-steps button').forEach(function (b) { b.classList.toggle('on', b.dataset.step === step); });
    }
    el.querySelectorAll('.bp-steps button').forEach(function (b) {
      b.addEventListener('mouseenter', function () { focus(b.dataset.step); });
      b.addEventListener('mouseleave', function () { focus(pinned); });
      b.addEventListener('click', function () { pinned = pinned === b.dataset.step ? null : b.dataset.step; focus(pinned); });
    });
    // Hovering a part of the drawing highlights its step too.
    bp.querySelectorAll('.part, .mark').forEach(function (n) {
      n.addEventListener('mouseenter', function () { focus(n.getAttribute('data-step')); });
      n.addEventListener('mouseleave', function () { focus(pinned); });
    });
  }

  return { render: render, STEPS: STEPS };
})();
