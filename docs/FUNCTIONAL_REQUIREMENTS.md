# Functional Requirements — Off-Grid Solar + Battery Design (Victoria, BC)

Derived from the *URECx Solve Design Hackathon Challenge Package* and the *Solve Energy Hackathon Judging Rubric*. Each requirement shows where it's implemented and how it's verified. The live pass/fail status of FR-1…FR-10 appears in the app's **Overview → Challenge requirements** panel.

## Scope

Design a solar + battery system from EG4 FlexBOSS21 inverters, EG4 280Ah All-Weather batteries, EG4 GridBOSS units and JA Solar JAM54D41-440/LB panels. It must power a 400 A residential service in Victoria, BC completely off-grid (no export), with the existing 6 kW BE7500ID generator integrated and its annual operating cost minimised.

## Design requirements

| ID | Requirement | Source | Implementation | Verification |
|---|---|---|---|---|
| FR-1 | Determine the number of solar panels, FlexBOSS21 inverters, GridBOSS units and 280Ah batteries | Challenge — *System Design Requirements* | `engine.js` `minimums()`, `buildDesign()`; optimizer `optimize()` / `evaluate()` | Overview BOM; `tests/engine.test.js` › Component minimum rules |
| FR-2 | Provide whole-home backup for **three days** | Challenge | `engine.js` `autonomy()`: full battery, average season sun, no generator; design season selectable (default winter, the worst case) | Checklist FR-2; test "default design meets 3-day winter backup" |
| FR-3 | Use a 30 kWh/day spring baseline with seasonal changes: winter +30 %, summer −15 %, fall +15 % | Challenge | `data.js` `SEASONS`; `engine.js` `seasonalDailyLoad()` | test "seasonal daily loads match challenge factors" |
| FR-4 | Distribute daily load hour by hour using the challenge bell curve | Challenge — *Typical Spring Day* chart | `data.js` `SPRING_HOURLY_KWH` (sums to 30.00 kWh) → `LOAD_SHAPE` | test "spring hourly load sums to 30 kWh" |
| FR-5 | Estimate seasonal solar production from Victoria peak sun hours (1.17 / 4.25 / 6.02 / 2.41 h) with the hourly production profile | Challenge — *Solar Production Assumptions* | `data.js` `SEASONS.psh`, `SOLAR_HOURLY_PCT`; `engine.js` `yearSeries()`, `dailyPsh()` | tests › Weather; checklist FR-5 (no unserved hours) |
| FR-6 | Verify string voltage against FlexBOSS21 MPPT limits with Voc,max = Voc × (1 + (Tmin − 25) × −0.250/100) | Challenge — *Helpful Calculations* | `engine.js` `vocMax()`, `stringDesign()`, `stringLayout()`; Victoria design low −16 °C | tests › PV string sizing; Overview string table |
| FR-7 | Respect equipment limits: 12 kW battery-only / 16 kW per inverter, ≤ 21 kW PV per inverter, ≥ 600 Ah battery per inverter, ≤ 3 inverters and 200 A per GridBOSS, 140 A per battery | EG4 datasheets | `engine.js` `minimums()`, `limits()` | Checklist FR-7 rows; tests › Component minimum rules |
| FR-8 | Incorporate the existing 6 kW BE7500ID generator | Challenge | Generator → GridBOSS GEN port (125 A) with 2-wire auto-start; `engine.js` `simulateYear()` generator dispatch | Single-line diagram; checklist FR-8 |
| FR-9 | Operate completely off-grid; no power exported or sold | Challenge | No export path in dispatch; surplus PV is curtailed and reported | Checklist FR-9; test "no export: surplus is curtailed" |
| FR-10 | Minimise the generator's annual operating cost: $1.65/kWh, $300 service every 100 kWh, 2 % efficiency loss per service | Challenge — *Generator Optimization* | `engine.js` `runGenerator()`, `generatorCostByYear()`; forecast-aware dispatch; lifecycle optimizer | tests › Generator accounting; Generator tab 20-year comparison |
| FR-11 | Account for the interaction of seasonal solar, battery capacity, inverter capacity and the hourly load profile when deciding when the generator runs | Challenge | 8,760-hour simulation with efficiencies and power limits; 36 h look-ahead dispatch | Energy tab charts; test "forecast-aware dispatch uses less generator" |
| FR-12 | Integrate PV, batteries, FlexBOSS21, GridBOSS, generator and the existing 400 A service into a practical system | Challenge — *Basic System Flow* | No utility connection: 2 × GridBOSS → 2 × 200 A panels; inverters paralleled on a shared 48 V bank, generator on the GEN port | Overview single-line diagram |
| FR-13 | Total system cost using the challenge equipment prices | Challenge — *Equipment Costs* | `budget.js` `capex()` | test "challenge unit prices are used" |

## Financial requirements (rubric: Business — 20 %)

| ID | Requirement | Implementation |
|---|---|---|
| FR-14 | High-fidelity capital budget for the City of Victoria: equipment, balance of system, labour, permits, taxes, contingency | `budget.js` `capex()`, covering the City of Victoria electrical permit ($441 + 1.25 % over $20k), building permit ($100 + 1.40 %), BC PST per Bulletin 203 (batteries taxable, PV exempt), GST 5 %, island freight, WorkSafeBC access, CEC 64-218 rapid shutdown |
| FR-15 | Operating and lifecycle cost: generator (with service, degradation, replacement), O&M, inverter and battery replacement, discounted to NPV | `budget.js` `lifecycle()`; `engine.js` `lifecycleEnergy()` (PV ageing 0.4 %/yr) |
| FR-16 | Compare meaningful design alternatives and show how choices move capital vs operating cost | Design search over 20 weather years (`ui/search.js`, `engine.js` `evaluateYears()`): Optimizer heatmap, Suggestions tiers (recommended = lowest worst-year lifecycle cost); `docs/BUDGET_VICTORIA.md` §5 |
| FR-17 | State assumptions and sources | Assumptions tab; `data.js` `SOURCES` |
| FR-18 | Exportable budget | CSV export (Budget tab); `node tools/report.js` → `docs/BUDGET_VICTORIA.md` |

## Automation requirements (rubric: Creativity — 25 %)

| ID | Requirement | Implementation |
|---|---|---|
| FR-19 | An automation concept with defined inputs, decisions and actions, integrated with the proposed hardware | Forecast-aware generator dispatch. **Inputs:** BMS SOC, CT load/PV, 36 h solar forecast. **Decisions:** projected SOC vs floor + reserve; minimum run time. **Actions:** GridBOSS dry-contact 2-wire start/stop. |
| FR-20 | Demonstrate the benefit against a conventional baseline across realistic conditions | Strategy comparison over 20 seeded weather years (P50/P90 kWh, cost, starts); ≈ 22 % lower generator cost on the recommended design |
| FR-21 | Handle important operating limits | Forecast error, minimum run time, generator capacity, inverter and BMS current limits, last-resort start, generator replacement at an efficiency threshold |

## Non-functional requirements

| ID | Requirement | Implementation |
|---|---|---|
| NFR-1 | Runs as a static site with no build step and no network dependencies (same approach as `shubin123/drippage`) | Plain HTML/CSS/JS; SVG charts in `charts.js` |
| NFR-2 | Every input is adjustable and persists between visits | Schema-driven `settings.js`; localStorage with in-memory fallback |
| NFR-3 | Reproducible results | Seeded PRNG for weather and forecast error |
| NFR-4 | Automated tests for the physics, rules and budget | `node tests/run-tests.js` (Node) or `tests/index.html` (browser) |
| NFR-5 | Printable report | Print stylesheet renders every tab |

## Key assumptions

1. Seasons are Dec–Feb (winter), Mar–May (spring), Jun–Aug (summer), Sep–Nov (fall).
2. The three-day backup test starts from a full battery at midnight under average season sun, with no generator. The zero-sun result is also reported as a stress case.
3. The generator's 2 % "efficiency" loss per service raises fuel cost per kWh ($1.65 ÷ efficiency); rated output is unchanged. Replacing it below 70 % efficiency for $3,500 is an assumption.
4. The proposed system is completely off-grid: it has no BC Hydro connection, imports no utility energy and exports no energy.
5. The GridBOSS is treated as a PST-exempt PV-system controller; confirm this with the supplier.
6. Multiple GridBOSS units sharing one paralleled FlexBOSS21 battery bank must be confirmed with EG4 for this exact configuration.
7. The current design deliberately caps strings at 11 modules even though 12 passes the cold-Voc protection calculation: 11 maintains margin below the 440 V full-power ceiling at the −16 °C design condition.
8. The one-line is preliminary, not construction documentation: the final design must coordinate 350 A Class-T protection with conductor ampacity, make exactly one neutral–ground bond at the first service disconnect, and verify the generator neutral arrangement with its manufacturer.
