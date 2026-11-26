# Process Panel

This case is a personal, local project-process manager and a learning project.
Read [DISCUSSION.md](DISCUSSION.md) for agreed behavior, [GLOSSARY.md](GLOSSARY.md)
for terminology, and relevant decisions in [docs/adr/](docs/adr/).

## Stack

Before changing technologies or runtime structure, read
[ADR-0002](docs/adr/0002-go-server-and-typescript-interface.md).
Before implementing process control, read
[ADR-0001](docs/adr/0001-manage-only-panel-launched-processes.md) and validate
Windows process-tree termination, including an abnormal panel exit.

## Startup contract

The first implementation slice is issue #2: session-only registrations, start,
output, and stop. Persistence and the remaining lifecycle scenarios belong to
issues #3 and #4. Read [README.md](README.md) for setup and verification.

From `cases/process-panel/`, after the implementation's initial dependency setup:

```sh
npm start
```

Open **http://127.0.0.1:4000** in a browser.

This command builds the browser interface and starts the Go server,
which serves both the interface and API at that address. Bind to IPv4 loopback
only. If the port is occupied, startup reports the error and leaves the existing
process running. Use this document as the authoritative source for the launch command
and address.

## Implementation handoff

Before implementation, read [specification issue #1](https://github.com/Contempl/WorkWithAgents/issues/1)
and the selected ticket, including comments and blocking relationships.
Begin application implementation only on an explicit user command; a published
specification or a ready-for-agent label is not that command.

## Process-control evidence

Windows Job Objects were validated on this computer before process-control
implementation. The disposable source and observed results are archived on local
branch `prototype/process-panel-windows-job`, commit `9da8526`, under
`cases/process-panel/windows-job-probe/`. Read it with `git show` from that branch.
The probe checked
normal termination, controller crash, both descendant identities, stopped HTTP,
and an unrelated HTTP server remaining alive. Read its RESULT.md before changing
the process-launch mechanism. Windows 10 or newer is required for creation-time
job assignment. Browser acceptance tests use the installed Edge browser and real
owned processes; they must never stop a process found by port.
