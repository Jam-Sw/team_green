# ☀️ SunPage — Off-Grid Solar + Battery Planner (Victoria, BC)

**Live app:** https://jam-sw.github.io/team_green/ · [browser test suite](https://jam-sw.github.io/team_green/tests/)

Team Green's entry for the URECx Solve Design Hackathon. It sizes, simulates and budgets an off-grid EG4 FlexBOSS21 + GridBOSS + 280Ah battery system with JA Solar 440 W panels, powering a 400 A residential service in Victoria, BC. The existing 6 kW generator is dispatched by a forecast-aware automation.

The architecture follows [`shubin123/drippage`](https://github.com/shubin123/drippage): a static, dependency-free site with a schema-driven control panel, a pure calculation engine, and a zero-dependency test runner that works in Node and in the browser.

## Quick start

```bash
python3 -m http.server 8000     # then open http://localhost:8000
node tests/run-tests.js         # 53 tests: physics, datasheet rules, budget
node tools/report.js            # regenerate docs/BUDGET_VICTORIA.md

npm install && npx playwright install chromium
npm run test:e2e                # build _site/, serve at /team_green/ like Pages, run 12 browser tests
E2E_BASE_URL=https://jam-sw.github.io/team_green/ npm run test:e2e:live   # same tests on the live site
```

GitHub Pages publishes `main` from the repository root at https://jam-sw.github.io/team_green/. `.github/workflows/ci.yml` runs the unit and e2e tests on every push and PR. After each Pages build, `.github/workflows/pages-e2e.yml` reruns the e2e suite against the live site. The e2e suite fails on any console error, any broken request, and any request outside the `/team_green/` sub-path, so a root-absolute URL that works on localhost but 404s on Pages gets caught.

## Recommended design

| | |
|---|---|
| Solar | **92 × JA Solar JAM54D41-440/LB** — 40.5 kWp, 8 strings of 11–12 |
| Inverters | **2 × EG4 FlexBOSS21** (paralleled, shared 48 V bank) |
| GridBOSS | **2** — one per 200 A leg of the 400 A service |
| Storage | **5 × EG4 280Ah All-Weather** — 71.7 kWh (57 kWh usable) |
| Service | 400 A fused disconnect → distribution splitter → 2 × 200 A panels |
| Generator | Existing BE7500ID on the GridBOSS GEN port, 2-wire auto-start |
| Installed cost | **≈ $163k incl. GST/PST** (see [docs/BUDGET_VICTORIA.md](docs/BUDGET_VICTORIA.md)) |
| Winter backup, no generator | 9+ days at average sun (target: 3) |
| Generator | ≈ 800–1,000 kWh/yr; forecast-aware dispatch ≈ 22 % cheaper than an SOC trigger |

For the challenge inputs and stated assumptions, the optimizer selects this design as the lowest projected 25-year cost. Dollar figures are CAD estimates, include modelled GST/PST where stated, exclude rebates, and require an installer quote and site validation.

## What's in the app

Every tab opens with one sentence saying what it shows, and every chart has a caption saying how to read it. Settings use plain words and units. Technical terms are defined on the Assumptions tab.

| Tab | Contents |
|---|---|
| **Overview** | One-sentence verdict, headline numbers, parts list with the rule behind each count, requirement checklist (FR-1…FR-10), blueprint single-line diagram explained in six steps, string sizing |
| **Suggestions** | Transparent local projection: four acceptable tiers, what each trades off, settings markers, and one-click application to System |
| **Energy** | Average day by season (where each hour's power comes from), battery level, month by month, every hour of the year, backup days with no generator |
| **Generator** | The automation in three steps (read → decide → act), forecast-aware vs. a battery-level rule over 20 weather years, generator cost by year |
| **Optimizer** | 25-year cost of every panel × battery mix; numbered Suggestions tiers; click any square to load that design |
| **Budget** | Installed cost by category with all line items on request (permits, PST/GST, labour), CSV export, running cost by year, BC Hydro comparison |
| **Assumptions** | Model and budget assumptions, a glossary of terms, and sources |

## How the code is organised

```
settings ──► model ──► tabs
(controls)   (engine + budget)   (one file per tab)
```

1. **Settings.** `settings.js` lists every adjustable input. `ui/controls.js` builds the left panel from that list, so a new input appears without touching any UI code.
2. **Model.** `ui/model.js` turns the settings into the design, a simulated hourly year, the backup test, the budget and the requirement checks. It calls the pure calculation files, which never touch the page.
3. **Tabs.** Each file in `ui/tabs/` is one tab: a title, a one-line intro, its cards, and a `render(model)` function. `app.js` builds the tab bar from them and keeps the URL hash in sync.

| File | Role |
|---|---|
| `data.js` | Challenge inputs, datasheet specs, Victoria fees/tax/climate, sources |
| `engine.js` | String sizing, component rules, weather, hourly dispatch, generator model, autonomy, optimizer |
| `budget.js` | Capital budget, Victoria permits, BC PST/GST, lifecycle NPV |
| `settings.js` | Parameter schema (drives the control panel) and persistence |
| `app.js` | Wires settings → model → tabs; tab routing |
| `ui/ui.js` | Formatting, card/table/KPI builders, tab registry |
| `ui/model.js`, `ui/controls.js`, `ui/search.js`, `ui/sld.js` | Model, settings panel, local design search, single-line diagram |
| `ui/tabs/*.js` | Overview, Suggestions, Energy, Generator, Optimizer, Budget, Assumptions |
| `charts.js`, `styles.css`, `index.html` | SVG charts, styles (light + dark), page shell |
| `tests/` | `run-tests.js` (Node) and `index.html` (browser) |
| `e2e/`, `playwright.config.js` | Browser tests against the Pages-style build |
| `tools/report.js` | Generates the budget report from the engine |
| `tools/build-site.js`, `tools/serve.js` | Build `_site/` and serve it under `/team_green/` |
| `docs/FUNCTIONAL_REQUIREMENTS.md` | Requirements traced to code and tests |
| `docs/BUDGET_VICTORIA.md` | Generated high-fidelity budget |
| `research/preliminary-research.md` | Preliminary research for the Solve Energy solar challenge |
| `AGENTS.md`, `skills/` | Guide and project-specific skills for AI agents working on this repo (start with `skills/team-green-context`) |
