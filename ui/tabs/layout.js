/**
 * Panel layout tab — a deliberately illustrative site sketch.
 *
 * The drag / orbit affordance is inspired by Shubin123/6dof-gym-web's
 * optional viewport: direct manipulation belongs in the browser, while the
 * planner remains explicit about what it can and cannot calculate.
 */
(function () {
  'use strict';

  var U = window.SunUI;
  var state = { x: 0, y: 0, angle: -24, dragging: false, px: 0, py: 0 };
  var app, lastDesign;

  U.tab({
    id: 'layout',
    title: 'Layout',
    intro: 'A movable visual sketch of the selected solar array. It helps explain a possible layout, but it does not replace a site survey or change the design calculation.',
    html:
      U.card('Move the solar array',
        U.caption('Drag the array to explore placement. Rotate it to discuss orientation. These movements are illustrative only: roof area, shade, setbacks, structure and electrical routing still need an installer survey.') +
        '<div class="layout-stage" id="layoutStage"><svg id="layoutSvg" role="img" aria-label="Illustrative movable solar-panel layout"></svg><p class="layout-readout" id="layoutReadout"></p></div>' +
        '<div class="layout-actions"><button class="btn-ghost" type="button" data-layout-angle="-24">South-west view</button><button class="btn-ghost" type="button" data-layout-angle="0">Straight on</button><button class="btn-ghost" type="button" data-layout-angle="24">South-east view</button><button class="btn-link" type="button" id="layoutReset">Reset position</button></div>') +
      U.card('What this view is — and is not',
        '<div class="prose"><p><b>Useful for:</b> showing the selected panel count, grouping panels into strings, and discussing a tentative roof or ground-array location.</p>' +
        '<p><b>Not a site plan:</b> moving the array does not alter production, budget, permits or the optimizer. Those values stay tied to the model inputs until measured site data is available.</p>' +
        '<p class="muted">Interaction pattern inspired by <a href="https://github.com/Shubin123/6dof-gym-web" target="_blank" rel="noopener">Shubin123/6dof-gym-web</a>: a lightweight, direct-manipulation viewport loaded as part of the page rather than a hidden recommendation system.</p></div>'),

    init: function (a) {
      app = a;
      U.$('layoutStage').addEventListener('pointerdown', startDrag);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', endDrag);
      U.$('layoutReset').addEventListener('click', function () { state.x = 0; state.y = 0; state.angle = -24; draw(lastDesign); });
      U.$('tab-layout').addEventListener('click', function () { draw(app.model().d); });
      U.$('layoutStage').addEventListener('keydown', function (e) {
        var step = e.shiftKey ? 20 : 8;
        if (e.key === 'ArrowLeft') state.x -= step;
        else if (e.key === 'ArrowRight') state.x += step;
        else if (e.key === 'ArrowUp') state.y -= step;
        else if (e.key === 'ArrowDown') state.y += step;
        else return;
        e.preventDefault(); draw(lastDesign);
      });
      document.querySelectorAll('[data-layout-angle]').forEach(function (b) {
        b.addEventListener('click', function () { state.angle = +b.dataset.layoutAngle; draw(lastDesign); });
      });
    },

    render: function (m) { lastDesign = m.d; draw(m.d); }
  });

  function startDrag(e) {
    if (!e.target.closest('.array-hit')) return;
    state.dragging = true; state.px = e.clientX; state.py = e.clientY;
    U.$('layoutStage').setPointerCapture(e.pointerId);
    U.$('layoutStage').classList.add('dragging');
  }
  function move(e) {
    if (!state.dragging) return;
    state.x = clamp(state.x + e.clientX - state.px, -180, 180);
    state.y = clamp(state.y + e.clientY - state.py, -74, 74);
    state.px = e.clientX; state.py = e.clientY; draw(lastDesign);
  }
  function endDrag() { state.dragging = false; var el = U.$('layoutStage'); if (el) el.classList.remove('dragging'); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function draw(d) {
    if (!d || !U.$('layoutSvg')) return;
    var svg = U.$('layoutSvg'), cols = Math.min(12, Math.ceil(Math.sqrt(d.panels * 1.45)));
    var rows = Math.ceil(d.panels / cols), w = 27, h = 17, gap = 3;
    var aw = cols * (w + gap) - gap, ah = rows * (h + gap) - gap;
    var cx = 320 + state.x, cy = 180 + state.y;
    var skew = state.angle * 0.34, cells = [];
    for (var i = 0; i < d.panels; i++) {
      var col = i % cols, row = Math.floor(i / cols);
      cells.push('<rect class="layout-panel" x="' + (col * (w + gap)) + '" y="' + (row * (h + gap)) + '" width="' + w + '" height="' + h + '" rx="1"/>');
    }
    svg.setAttribute('viewBox', '0 0 640 360');
    svg.innerHTML =
      '<defs><linearGradient id="ground" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#d8e1e0"/><stop offset="1" stop-color="#bccdca"/></linearGradient></defs>' +
      '<rect class="layout-sky" width="640" height="360"/>' +
      '<path class="layout-ground" d="M0 156 L640 118 V360 H0Z"/>' +
      '<path class="layout-roof" d="M38 222 L286 146 L592 197 L366 303Z"/>' +
      '<path class="layout-roof-line" d="M38 222 L286 146 L592 197"/>' +
      '<g class="layout-array" transform="translate(' + (cx - aw / 2) + ' ' + (cy - ah / 2) + ') skewY(' + skew + ')">' +
        '<rect class="array-hit" x="-12" y="-12" width="' + (aw + 24) + '" height="' + (ah + 24) + '" rx="5"/>' + cells.join('') +
      '</g>' +
      '<text class="layout-label" x="24" y="42">ILLUSTRATIVE SITE SKETCH</text><text class="layout-label detail" x="24" y="62">Drag the amber-framed array</text>';
    svg.parentNode.setAttribute('tabindex', '0');
    U.$('layoutReadout').textContent = d.panels + ' panels · ' + d.layout.count + ' strings · ' + d.layout.strings.join(' / ') + ' panels per string · view ' + (state.angle < 0 ? 'south-west' : state.angle > 0 ? 'south-east' : 'straight on');
  }
})();
