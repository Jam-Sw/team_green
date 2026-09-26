# ☀️ SunPage — Off-Grid Solar + Battery Planner (Victoria, BC)

Team Green's entry for the URECx Solve Design Hackathon. It sizes, simulates and budgets an off-grid EG4 FlexBOSS21 + GridBOSS + 280Ah battery system with JA Solar 440 W panels, powering a 400 A residential service in Victoria, BC. The existing 6 kW generator is dispatched by a forecast-aware automation.

The architecture follows [`shubin123/drippage`](https://github.com/shubin123/drippage): a static, dependency-free site with a schema-driven control panel, a pure calculation engine, and a zero-dependency test runner that works in Node and in the browser.

## Quick start

```bash
python3 -m http.server 8000     # then open http://localhost:8000
node tests/run-tests.js         # 52 tests: physics, datasheet rules, budget
node tools/report.js            # regenerate docs/BUDGET_VICTORIA.md

npm install && npx playwright install chromium
npm run test:e2e                # build _site/, serve at /team_green/ like Pages, run 7 browser tests
E2E_BASE_URL=https://jam-sw.github.io/team_green/ npm run test:e2e:live   # same tests on the live site
```

`.github/workflows/pages.yml` runs the unit and e2e tests on every push and PR. On `main` it then deploys `_site/` to GitHub Pages and reruns the e2e suite against the live URL. The e2e suite fails on any console error, any broken request, and any request outside the `/team_green/` sub-path, so a root-absolute URL that works on localhost but 404s on Pages gets caught.

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

The optimizer puts this design within 0.3 % of the lowest 25-year lifecycle cost, at $44k less capital than the absolute optimum (120 panels / 7 batteries / 3 inverters).

## What's in the app

| Tab | Contents |
|---|---|
| **Overview** | KPIs, bill of materials with the rule behind each count, live requirement checklist (FR-1…FR-10), single-line diagram, Voc,max string sizing |
| **Energy** | Average day per season (solar / battery / generator vs load), battery SOC, monthly balance, 8,760-hour SOC trace, autonomy table |
| **Generator** | The automation (inputs → decisions → actions), a 20-weather-year strategy comparison, 25-year generator cost with service, degradation and replacement |
| **Optimizer** | Panels × batteries heatmap of lifecycle cost; alternatives table; click any cell to load that design |
| **Budget** | Line-item Victoria budget (permits, PST/GST, labour, BOS, contingency), CSV export, lifecycle cash flow, BC Hydro context |
| **Assumptions** | Every modelling and budget assumption, with sources |

## Files

| File | Role |
|---|---|
| `data.js` | Challenge inputs, datasheet specs, Victoria fees/tax/climate, sources |
| `engine.js` | String sizing, component rules, weather, hourly dispatch, generator model, autonomy, optimizer |
| `budget.js` | Capital budget, Victoria permits, BC PST/GST, lifecycle NPV |
| `settings.js` | Parameter schema (drives the control panel) and persistence |
| `charts.js`, `app.js`, `index.html`, `styles.css` | UI |
| `tests/` | `run-tests.js` (Node) and `index.html` (browser) |
| `tools/report.js` | Generates the budget report from the engine |
| `docs/FUNCTIONAL_REQUIREMENTS.md` | Requirements traced to code and tests |
| `docs/BUDGET_VICTORIA.md` | Generated high-fidelity budget |
| `research/preliminary-research.md` | Preliminary research for the Solve Energy solar challenge |
