---
name: solar-sizing
description: Use when sizing solar PV or PV+battery systems for coastal BC / Victoria projects. Step-by-step sizing method, default parameters, worked example, and pitfalls.
---

# Solar PV sizing — coastal BC / Victoria method

## Method (6 steps, in order)

1. **Load analysis** — annual kWh from 12 months of data; daily profile shape; list critical
   loads for backup (fridge, lights, internet, medical) in kWh/day.
2. **Resource → yield** — pick a site-specific yield. Victoria defaults: **~1,040 kWh/kW·yr**
   typical (some model reports give ~1,300+ at optimal tilt — model the site in PVWatts rather
   than trusting one number). Optimal fixed tilt ≈ **37°**, facing south. Winter (Nov–Feb) output
   ≈ **¼** of summer — the seasonal shape drives storage/backup design.
3. **Array size** — `DC kW = annual target kWh ÷ yield`; module count = target ÷ module W
   (typical modern module: 400–500 W, ~2 m² each).
4. **Inverter / MPPT** — DC:AC ratio typically 1.2–1.35; verify string voltage window at
   record-cold temperatures.
5. **Battery (if any)** — `kWh = daily critical kWh × autonomy days ÷ (DoD × round-trip eff)`.
   LFP defaults: DoD ≈ 90%, round-trip ≈ 85–90%.
6. **Cost & payback** — BOM with vendors; plug into the `bc-solar-economics` formulas.
   Get or cite a real cost source; never invent $/W figures.

## Default parameters (state every assumption on deliverables)

| Parameter | Default | Note |
| --- | --- | --- |
| Yield (Victoria) | ~1,040 kWh/kW·yr | third-party estimate; range up to ~1,330 by model/tilt |
| Tilt | 37° fixed | Victoria optimum per model report |
| Azimuth | 180° (south) | |
| Performance ratio | 0.75–0.85 | NRCan: ~0.75–0.9 in early years |
| Module | 400–500 W, ~2 m² | typical modern |
| DC:AC ratio | 1.2–1.35 | typical design practice |
| Battery (LFP) | DoD ~90%, RTE ~85–90% | typical |

## Worked mini-example

6,000 kWh/yr household target → 6,000 ÷ 1,040 ≈ **5.8 kW DC** → 14 × 420 W modules (~28 m²) →
5 kW inverter (DC:AC ≈ 1.15) → battery for 3 kWh/day critical × 1 day autonomy ÷ (0.90 × 0.88)
≈ **3.8 kWh** usable. Then cost it with `bc-solar-economics`. Label every number as an estimate.

## Tools

- NREL PVWatts — https://pvwatts.nrel.gov (site yield, standard estimates)
- NRCan PV potential maps — https://natural-resources.canada.ca/energy-sources/renewable-energy/photovoltaic-potential-solar-resource-maps-canada
- City of Victoria Solar Rooftop Calculator — https://solarrooftop.victoria.ca/prod/public/index.php
- pvlib-python + a Victoria TMY/EPW weather file; NREL SAM for larger models
- Shading: aerial imagery + on-site checks (trees, chimneys, future construction)

## Pitfalls (from the March 2026 precedent + coastal realities)

- **Winter deficit:** cloud, low sun, and snow mean summer performance is not year-round
  performance — say so explicitly.
- **Export earns only 10¢** → oversizing hurts; anchor sizing to consumption (see `bc-solar-economics`).
- **Units and assumptions:** judges probe them; label everything.
- **Coastal specifics:** salt spray (hardware ratings), wind loading, deciduous tree shading.