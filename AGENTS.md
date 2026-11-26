# Agent Kit

This repository is a shared harness for projects. The root holds reusable skills,
settings, and development workflow rules. `cases/` holds independent cases; keep
each case's code, documentation, glossary, and decisions in its own folder.

For the current case, follow the [Process Panel instructions](cases/process-panel/AGENTS.md).

## Writing language

Write specifications, issue descriptions, pull requests, and user-facing reports
in Russian. Write agent instructions, skills, glossaries, ADRs, and other
agent-facing documentation in English. Preserve canonical glossary terms when
referring to domain concepts in either language.

## Agent skills

- Skills: read the relevant `SKILL.md` in [.agents/skills/](.agents/skills/) before
  using a skill. Use `writing-for-agents` when creating or editing agent-facing
  documents, including project copies of skills.
- Issues: before creating, updating, or reading tickets, follow
  [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- Domain docs: before exploring a case or recording terms and decisions, follow
  [docs/agents/domain.md](docs/agents/domain.md).
