# Domain docs

## Before exploring a case

1. Read [GLOSSARY-MAP.md](../../GLOSSARY-MAP.md) and find the relevant case.
2. Read its `cases/<case>/GLOSSARY.md` when present.
3. Read relevant ADRs in `cases/<case>/docs/adr/` and shared `docs/adr/`.

If a glossary or ADR directory is absent, continue with the task. Create domain
documents through `domain-modeling` when a term is resolved or a decision merits
an ADR. Apply `writing-for-agents` when writing these documents.

## Layout and scope

- `GLOSSARY-MAP.md`: the root index of case glossaries; update it when adding a case.
- `cases/<case>/GLOSSARY.md`: that case's terms and meanings.
- `cases/<case>/docs/adr/`: decisions scoped to that case.
- `docs/adr/`: decisions about the shared Agent Kit.

Each case owns its vocabulary. Interpret a term within the case being discussed,
even if another case uses the same word differently. Keep implementation details
in specifications or ADRs; glossary entries define domain meanings.

## Use and conflicts

Use the relevant glossary's canonical terms in discussion, documentation, code,
and issue titles. Surface conflicts with existing ADRs before proposing changes
that contradict them, naming the ADR and explaining the trade-off.
