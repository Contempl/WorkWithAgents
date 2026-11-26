# Issue tracker: GitHub

Track tasks and specifications in GitHub Issues for `Contempl/WorkWithAgents`.
Use GitHub CLI (`gh`) from this repository.

## Delivery

Implementation closes Issues through approved PRs merged into `main`. Before
implementing a ticket or specification, follow
[implementation.md](implementation.md) for branches, review, PR creation, user
acceptance, and post-merge closure. Keep Issues open while their PR is unmerged.

## Target repository

Before the first issue write in a session, run
`gh repo view --json nameWithOwner` and verify the result is
`Contempl/WorkWithAgents`. Pass `--repo Contempl/WorkWithAgents` explicitly when
working outside this checkout. Ask the user before writing to a different repo.

## Operations

- Create: `gh issue create --title "..." --body-file <file>`.
  Write multiline bodies to a temporary UTF-8 file first.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,labels,assignees`.
- Comment: `gh issue comment <number> --body-file <file>`.
- Labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: post the resolution as a comment, then run `gh issue close <number>`.
  Post the comment separately even when the issue is already closed.

## Relationships

Use native GitHub sub-issues for parent-child relationships and native issue
dependencies for blockers. Use `gh issue create --parent <parent>` and
`gh issue edit <child> --add-blocked-by <blocker>` where supported. Otherwise,
record `Part of #<parent>` and `Blocked by: #<number>` in the issue body.
A task becomes unblocked when all its blockers are closed.

## Request surface

**PRs as a request surface: no.** Tasks and specifications enter through issues.

When a skill says to publish to the tracker, create an issue here. When it says
to fetch a ticket, read the corresponding issue, including comments.
