# Fresh-session handoff observations

Exercise: Project output copying, [Issue #5](https://github.com/Contempl/WorkWithAgents/issues/5)
and [PR #6](https://github.com/Contempl/WorkWithAgents/pull/6).
These observations describe the exercise, not extra recurring task steps.

| Observation | What was available and why it was insufficient | Authoritative home |
| --- | --- | --- |
| A fresh planning session created Issue #5 without extra explanations. | Root instructions already point to the case and tracker; the task supplied a behavior and acceptance intent. | Retain those pointers; handoff inputs are described in implementation.md. |
| Implementation was first committed locally on main. | Upstream implement says to commit to the current branch. Root and case instructions had no task-branch requirement or pointer to a delivery procedure. | implementation.md, preparation. |
| The user had to request a PR separately. | Upstream implement does not promise a PR; tracker instructions described Issue operations but not PR-based delivery. | implementation.md, PR delivery; tracker links to it. |
| On follow-up inspection (2026-11-27), PR #6 had no approval comment or review. Issue #5 contained the implementer's acceptance report, and the user reported approving the merge. | There was no repository rule defining where user approval must be recorded or which commit it covers. This does not establish that user consent was absent. | Root AGENTS.md, merge authority; implementation.md, acceptance procedure. |
| implement, implement-spec, and code-review existed only as untracked local copies. | Sessions sharing this working folder could use them, but a fresh clone would not receive them. | Track the existing project skill copies unchanged. |

The first two implementation gaps were directly observed in this conversation;
the approval record and untracked skill copies were found during follow-up
inspection. Review these homes when a future session needs the same explanation.
