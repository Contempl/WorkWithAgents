# Agent Kit

This repository is a shared harness for projects. The root holds reusable skills,
settings, and development workflow rules. `cases/` holds independent cases; keep
each case's code, documentation, glossary, and decisions in its own folder.

For the current case, follow the [Process Panel instructions](cases/process-panel/AGENTS.md).

## Work routing

The user chooses when to discuss, specify, or implement a task.
Small changes: Issue -> implementation -> checks and review -> PR -> user acceptance -> merge.
Unsettled behavior: discussion -> specification -> tickets -> the same delivery path.
Before implementation or handing work to a new session, read
[docs/agents/implementation.md](docs/agents/implementation.md).

## Merge authority

Merge only after the user personally posts approval of the current full PR head
SHA in that PR and explicitly asks the agent to merge. Only the user authors
merge-approval comments; agents must never write approval on the user's behalf.
Any new commit requires fresh approval. Passing tests, agent reviews, and earlier
approval of another commit do not authorize merging the current head.

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
- Triage: before classifying Issues or changing readiness labels, follow
  [docs/agents/triage-labels.md](docs/agents/triage-labels.md).
- Domain docs: before exploring a case or recording terms and decisions, follow
  [docs/agents/domain.md](docs/agents/domain.md).
