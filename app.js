/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SunPage app — app.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * The whole page in three steps:
 *
 *   1. settings  — the control panel (ui/controls.js) edits them; saved locally
 *   2. model     — ui/model.js turns settings into design, simulation, budget
 *   3. tabs      — each ui/tabs/*.js renders one view of the model
 *
 * This file only wires those together: it builds the tab bar from the tab
 * registry, keeps the URL hash in sync with the open tab, and recomputes the
 * model when a setting changes.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  var S = window.SunSettings, U = window.SunUI;
  var settings = S.load();
  var model = null;
  var active = null;

  // Actions a tab may call.
  var app = {
    model: function () { return model; },
    loadDesign: function (panels, batteries) {
      settings.panels = panels;
      settings.batteries = batteries;
      settings.inverters = 1;
      S.save(settings);
      renderControls();
      recompute();
    }
  };

  // ── Settings → model ──────────────────────────────────────────────────
  var timer = null;
  function onSetting(key, value) {
    settings[key] = S.sanitize(key, value);
    S.save(settings);
    clearTimeout(timer);
    timer = setTimeout(recompute, 120);
  }

  function renderControls() { window.SunControls.render(U.$('controlPanel'), settings, onSetting); }

  function recompute() {
    model = window.SunModel.build(settings);
    window.SunControls.refresh(settings, model.d);
    renderStatus();
    renderTab(active);
  }

  function renderStatus() {
    U.$('statusBadge').className = 'status ' + (model.failed ? 'fail' : 'ok');
    U.$('statusText').textContent = model.failed
      ? model.failed + ' requirement' + (model.failed > 1 ? 's' : '') + ' failing'
      : 'All requirements met';
  }

  // ── Tabs ──────────────────────────────────────────────────────────────
  function buildTabs() {
    var nav = U.$('tabs'), view = U.$('view');
    U.tabs.forEach(function (t) {
      var a = document.createElement('a');
      a.className = 'tab';
      a.href = '#' + t.id;
      a.dataset.tab = t.id;
      a.setAttribute('role', 'tab');
      a.textContent = t.title;
      nav.appendChild(a);

      var panel = document.createElement('section');
      panel.className = 'tab-panel';
      panel.id = 'tab-' + t.id;
      panel.setAttribute('role', 'tabpanel');
      panel.innerHTML = '<p class="intro">' + t.intro + '</p>' + t.html;
      view.appendChild(panel);
      if (t.init) t.init(app);
    });
  }

  function tabById(id) { return U.tabs.filter(function (t) { return t.id === id; })[0]; }

  function show(id) {
    if (!tabById(id)) id = U.tabs[0].id;
    active = id;
    document.querySelectorAll('.tab').forEach(function (a) {
      var on = a.dataset.tab === id;
      a.classList.toggle('active', on);
      a.setAttribute('aria-selected', on);
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + id); });
    document.body.classList.remove('settings-open');
    renderTab(id);
  }

  function renderTab(id) {
    var t = tabById(id);
    if (t && model) t.render(model, app);
  }

  function route() { show(location.hash.slice(1)); }

  // ── Start ─────────────────────────────────────────────────────────────
  function init() {
    renderControls();
    buildTabs();
    window.addEventListener('hashchange', route);

    U.$('resetBtn').addEventListener('click', function () {
      S.clear();
      settings = S.defaults();
      renderControls();
      recompute();
    });
    U.$('printBtn').addEventListener('click', function () { window.print(); });
    U.$('settingsBtn').addEventListener('click', function () { document.body.classList.toggle('settings-open'); });
    document.querySelector('.content').addEventListener('click', function () { document.body.classList.remove('settings-open'); });

    // Print every tab, not just the open one, with details expanded.
    window.addEventListener('beforeprint', function () {
      U.tabs.forEach(function (t) { if (t.id !== 'optimizer') t.render(model, app); });
      document.querySelectorAll('.content details').forEach(function (d) { d.open = true; });
    });
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { renderTab(active); }, 150); });

    model = window.SunModel.build(settings);
    window.SunControls.refresh(settings, model.d);
    renderStatus();
    route();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
