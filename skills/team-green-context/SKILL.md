---
name: team-green-context
description: Use when starting work on the team_green hackathon repo or the UREC Sustainability Design Hackathon. Event context, Solve Energy partner profile, repo layout, and team conventions.
---

# team_green — hackathon project context

Load this first; it points to the other project skills.

## What this project is

Cooperative work repo for **team_green** at the **UREC Sustainability Design Hackathon** — a
one-day design sprint solving a real-world **solar challenge set by Solve Energy** (Victoria, BC
solar installer). The winning team gets guaranteed interviews with Solve Energy plus cash prizes;
mentors and judges are from Solve Energy.

## Event snapshot

| | |
| --- | --- |
| Event | UREC Sustainability Design Hackathon (host: UVic Renewable Energy Club) |
| Challenge | Real-world solar challenge by Solve Energy |
| Date | **Sat Sept 26, 8:30 AM – 6:30 PM** |
| Venue | University of Victoria |
| Teams | 2–5 people |
| Eligibility | All faculties; no engineering background required |
| Prizes | Guaranteed interviews with Solve Energy + cash |
| Meals | Provided |
| Announcement | https://www.linkedin.com/posts/urec-uvic-uvicengineering-share-7504457607915474944-R01-/ |

## Challenge partner: Solve Energy

- Victoria-founded solar + energy-efficiency company (founder Kane Hammontree)
- Residential / commercial / industrial solar + battery storage; assessment → design → install → maintenance
- Serves all of Vancouver Island, Greater Vancouver, and the Okanagan; 25-year workmanship/equipment warranties
- Their brand is customer hand-holding through **rebates, grants, and financing** — solutions that
  make incentives, permitting, and installation practical will read as "their kind of solution"
- https://solveenergy.ca

## Repo layout

- `research/` — context docs; start with `research/preliminary-research.md`
  (event, partner profile, BC rate context, solar resource data, precedent hackathon, playbook)
- `skills/` — agent skills: this one, `bc-solar-economics`, `solar-sizing`, `hackathon-deliverables`

## Team conventions

- Work on branches; PR into `main` (existing branches: `prelim-research`, `ai-skills`)
- Org-wide: issues and PRs follow the **OpenSpec format** (Why / What Changes /
  RFC 2119 Requirements / GIVEN-WHEN-THEN Scenario / Verification checklist) — see
  `Jam-Sw/.github` → `CONTRIBUTING.md`
- Cite sources for factual claims; judges may challenge numbers

## Numbers to know (details in the sibling skills)

- BC Hydro export price: **10¢/kWh fixed** (new self-generation rate, effective July 1, 2026)
  → self-consumption is worth more than export
- Victoria solar yield ≈ **1,040 kWh/kW·yr** typical; optimal fixed tilt ≈ **37°**;
  winter (Nov–Feb) ≈ ¼ of summer output
- Rebates: up to ~$5k solar + ~$1.5–5k battery; HPCN-member installation required for rebates

## Open questions (as of Sept 22, 2026)

- Exact challenge statement and constraints (site, budget, grid-tied vs off-grid, scale)
- Judging rubric/weights and deliverable format
- What data is provided at kickoff (weather file, load profiles, site details)

Update this skill and `research/preliminary-research.md` once these are known.