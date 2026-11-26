# Implementation and handoff

Use this delivery procedure for application, documentation, and harness changes.
It supplements the task steps in `implement` and `implement-spec`, including the
checkpoints those upstream skills do not provide.

## Handoff to a new session

The user provides the chosen step and an Issue number: `implement #N` for one
ticket, or `implement-spec #N` for a specification with child tickets. The user
may add constraints. A published Issue or `ready-for-agent` label alone is not a
command to start implementation.

The receiving agent finds the rest itself: root and applicable case AGENTS.md,
the installed skill, tracker configuration, full Issue and comments, parent
specification and blockers, relevant glossary and ADRs, documented standards,
scripts, and existing tests. Infer the case from the task; ask only if ambiguous.
The user need not repeat the repository, stack, startup command, or this process.

## 1. Prepare an isolated change

- Read the task and report its number and title. Check that its blockers are done.
- Fetch `origin` and create a task branch from current `origin/main`; keep task
  commits off `main`. Include the Issue number in every implementation commit.
  For `implement-spec`, create the integration branch from `origin/main`, then
  base each child implementer's branch on the assigned integration tip.
- For concurrent sessions, use a separate worktree and branch for each writer.
  Also use a worktree when the planning checkout needs to remain on `main`.
  Install that checkout's dependencies. Worktrees share ports and external data;
  isolate test data and choose free ports without stopping unrelated processes.
- Preserve existing user changes. Branch or worktree setup is done when the
  checkout is on the intended task branch with its base recorded.

## 2. Implement and verify behavior

- Use the selected skill and the agreed acceptance scenario and testing boundary.
  For behavior changes, reproduce the failure first, then implement and run the
  relevant checks. Use `tdd` when installed; otherwise perform the same red/green
  process directly and state that limitation in the report.
- Ask the user about a new substantial product or architectural decision. Surface
  large separate questions as follow-up work instead of silently expanding scope.
- Read commands from the case instructions and project scripts. Finish with the
  appropriate full checks; for docs-only work, verify links and instruction
  consistency rather than claiming application tests were run.

## 3. Commit before review

Commit the change before invoking `code-review`, so its committed diff is nonempty.
Resolve the latest fetched `origin/main` to a full SHA and use it as the default
review fixed point unless the user supplies another. Verify that it resolves and
record `git diff <base>...HEAD` and the commits being reviewed.

Run both Standards and Spec axes through `code-review`. Validate each finding
against the code: fix confirmed defects and explain rejected findings. Commit
fixes and repeat review of affected areas. If the base or head changes during
integration, update the review evidence. Report remaining limitations explicitly.

## 4. Open the PR without a separate reminder

An explicit implementation assignment includes pushing its task branch and
opening a PR after checks and review. Runtime tool approvals still apply; these
are different from asking the user to repeat the assignment.

- `implement`: one PR for the ticket.
- `implement-spec`: one integration PR for the specification and implemented
  child tickets. Keep them open until the approved integration PR merges.
- Target `main`, link the task with closing references, and write the description
  in Russian. Use `pr` if installed; otherwise describe the problem and resulting
  behavior, verification evidence and limits, merge risk, and review findings and
  their disposition. Do not claim an unavailable skill ran.
- Return the PR link, full head SHA, acceptance steps, and check/review results.
  This stage is complete when the pushed PR is ready for user acceptance.

## 5. User acceptance and merge

Follow the merge-authority rule in the root AGENTS.md. Ask the user to check the
acceptance scenario and personally post a comment such as
`Одобряю слияние коммита <full-head-SHA>` in the PR, then request merging.
Agent reports may describe checks; they must not serve as user approval.

Immediately before merging, re-read the PR head and the user's approval. If they
do not identify the same commit, return for renewed approval. Tool permissions
and branch protections are separate controls; this document does not install
them. Never bypass a merge approval by pushing directly to `main`, updating refs
through an API, changing protection, or weakening access settings.

## 6. Verify delivery and clean up

After the approved merge, verify the merged commit and linked Issue states. Add
the completion evidence to the task and close it if GitHub has not already done
so. Update the planning checkout only when its existing user changes are safe.
Remove only this task's merged branches and clean worktrees; retain dirty work
and artifacts still needed as evidence. Report the merge, checks, and task states.

## Why these pointers exist

See [handoff-observations.md](handoff-observations.md) when revisiting the process:
it records what the fresh-session exercise revealed and where the missing rules
were placed.
