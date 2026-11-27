# Triage labels

Use these canonical roles as the GitHub label names in this repository.

| Role and label | Meaning |
| --- | --- |
| `needs-triage` | A maintainer needs to evaluate the Issue. |
| `needs-info` | Waiting for information from the reporter. |
| `ready-for-agent` | The task is sufficiently specified for agent implementation. |
| `ready-for-human` | The task requires human implementation. |
| `wontfix` | The request will not be actioned. |

For Issues processed through `triage`, keep exactly one state label from this
table and one category label: `bug` for broken behavior or `enhancement` for an
improvement. Read the installed `triage` skill for transitions and brief writing.
This convention does not require relabeling historical closed Issues.

`ready-for-agent` describes task readiness, not an instruction to start work or
proof of completion. The user chooses when implementation begins; follow
[implementation.md](implementation.md) for delivery and merge approval.

When changing state, replace the previous state label. Closing an Issue records
completion; it does not require a separate done label. Other GitHub labels may
describe the topic and do not replace a triage state.
