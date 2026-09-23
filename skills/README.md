# Project skills (for AI agents)

Project-specific agent skills for the **team_green** hackathon repo, written in the portable
`SKILL.md` format (YAML frontmatter with `name` + `description`, then markdown instructions).
Any agent that supports skills — or can simply read a markdown file — can use them.

| Skill | Use when |
| --- | --- |
| [`team-green-context/`](team-green-context/SKILL.md) | Starting any session on this repo — event + partner context, repo layout, conventions |
| [`bc-solar-economics/`](bc-solar-economics/SKILL.md) | Evaluating savings, payback, rebates, or BC Hydro rate programs in BC |
| [`solar-sizing/`](solar-sizing/SKILL.md) | Sizing PV / PV+battery systems (array, inverter, battery, cost chain) |
| [`hackathon-deliverables/`](hackathon-deliverables/SKILL.md) | Building and presenting the event-day design package |

## How to load them

- **Claude Code:** copy into the project: `mkdir -p .claude/skills && cp -r skills/* .claude/skills/`
- **Codex / Cursor / other agents:** point the agent at `skills/` (the root `AGENTS.md` references it)
- **Hermes:** copy the skill folder(s) into `~/.hermes/skills/`
- **Anything else:** paste the relevant `SKILL.md` into the agent's context

## Maintenance

These are living documents. After the Sept 26 kickoff, fill in the open questions
(exact challenge statement, constraints, judging rubric) and keep all numbers cited to a source.