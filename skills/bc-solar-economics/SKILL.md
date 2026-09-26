---
name: bc-solar-economics
description: Use when evaluating solar economics in British Columbia — savings, payback, rebates, or BC Hydro rate programs. Covers the July 2026 self-generation rate change and how it should shape system design.
---

# BC solar economics (current as of Sept 2026)

## The rate change that reshapes every design: RS 2289

- BCUC decision (Order G-64-26, announced Mar 24, 2026): BC Hydro closed Net Metering
  (RS 1289) to new customers; the **Self-Generation Service Rate (RS 2289)** applies from
  **July 1, 2026**.
- **Exports are bought at a fixed 10¢/kWh** (net billing, instantaneous netting), credited
  each billing cycle; the price is held for 5 years. Export limit: 100 kW per phase.
- Retail power costs more than that (third-party summaries: ~12–14¢/kWh residential steps).
- **⇒ Every self-consumed kWh is worth more than an exported kWh.** Design for
  self-consumption, daytime load matching, and storage — oversized "export farms" are the
  classic mistake. (Useful counterintuitive point: sunnier sites suffer *most* from oversizing,
  because they produce the biggest summer surplus.)
- A Community Generation rate (RS 2290) also exists: shared facilities up to 2 MW sell at
  10¢/kWh; injection limits 24 kW residential / 100 kW commercial per benefitting customer —
  relevant for strata / multi-tenant / campus concepts.

## Rebates & incentives (verify current terms at bchydro.com before quoting)

- Solar rebate up to ~$5,000; battery up to ~$1,500 (without Peak Saver) to ~$5,000
  (with Peak Saver). Solve Energy markets "up to $10,000" combined for eligible solar + storage.
- **From June 1, 2026: installations must be completed by a Home Performance Contractor
  Network (HPCN) member** to be rebate-eligible.
- PST exemption on solar equipment is commonly cited (~$2k on a typical residential project).
- Keep incentives separate: (a) capital rebates, (b) financing (e.g. interest-free loan
  programs), (c) rate-program effects (export price).

## Savings & payback math (use exactly this; label all inputs)

```text
annual_value = kWh_self_consumed × retail_rate
             + kWh_exported     × 0.10          # BC Hydro RS 2289 export price
payback_yrs  = (capex − rebates) / annual_value
simple_LCOE  = lifetime_cost / lifetime_kWh     # optional; state discount rate if used
```

Worked example (illustrative — replace with the project's own numbers):
- Load 6,000 kWh/yr; array sized for ~5,500 kWh/yr generation; 70% self-consumed
  → 3,850 kWh × ~$0.125 ≈ $481/yr self-consumed value
  → 1,650 kWh × $0.10 = $165/yr export value → total ≈ $646/yr
  → payback = (capex − rebates) ÷ $646

## Design implications (feed these into solutions)

1. Size against **12 months of actual consumption**, not roof area or maximum export.
2. Use storage and scheduling to shift consumption into solar hours and off on-peak times (4–9 pm).
3. Quantify storage value twice: self-consumption uplift **and** backup resilience.
4. Show the rebate/incentive stack and permitting path — that is Solve Energy's own value proposition.

## Sources

- BC Hydro self-generation overview: https://www.bchydro.com/accounts-billing/electrical-connections/self-generation.html
- Rate updates (RS 2289 details): https://www.bchydro.com/toolbar/about/strategies-plans-regulatory/rate-design/self-generation-rate-updates.html
- BCUC decision summary (Mar 24, 2026): https://www.globenewswire.com/news-release/2026/03/24/3261699/0/en/BCUC-Approves-Changes-to-BC-Hydro-s-Net-Metering-Program.html
- BCUC Order G-64-26: https://norma.lexum.com/bcuc/orders/en/523115/1/document.do
- Rebate and retail figures above are partly third-party (solveenergy.ca, xolar.ca) — re-verify before final pitches.