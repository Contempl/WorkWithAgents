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

Implemented slices: issue #2 (start, output, stop), issue #3 (persistent
registrations, editing, removal, independent Projects), and issue #4 (errors,
reconnection, shutdown, crash recovery). Read [README.md](README.md) for setup,
data location, scenario coverage, and verification limits.

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

## Process-control evidence

Windows Job Objects were validated on this computer before process-control
implementation. The disposable source and observed results are archived on
branch `prototype/process-panel-windows-job` (also published to origin), commit `9da8526`, under
`cases/process-panel/windows-job-probe/`. Read it with `git show` from that branch.
The probe checked
normal termination, controller crash, both descendant identities, stopped HTTP,
and an unrelated HTTP server remaining alive. Read its RESULT.md before changing
the process-launch mechanism. Windows 10 or newer is required for creation-time
job assignment. Browser acceptance tests use the installed Edge browser and real
owned processes; they must never stop a process found by port.

## Registration storage

Only registration identity, name, folder, and command are persisted. Process
state and output belong to one Panel session. On load, every Project is stopped.
An unreadable or malformed store must fail startup rather than become an empty
list. Save a complete temporary file before replacing the old file; acknowledge
and change the in-memory list only after saving succeeds.

Browser tests use a test-only controller that creates a separate hidden console
for its owned Panel. It sends Ctrl+C for a normal shutdown or kills that exact
child for a crash. Test stores are isolated through PROCESS_PANEL_DATA_DIR under
test-results; tests must not touch the user's default store.

Direct Go-server crash checks intentionally have no enclosing controller cleanup
job: they must observe the Panel's own job closure. Only the npm launcher test
gets a controller-owned backup job for wrapper grandchildren. Preserve that
distinction so the harness cannot mask a regression in production crash cleanup.

## Lifecycle failures

A termination request is not proof of exit. Retain ownership and block launch,
edit, and removal until the job is confirmed empty. A failed stop remains
retryable. Keep stop intent separately from the displayed state so delayed
confirmation can finish a previously accepted stop after a timeout.

Shutdown must report failures and return a nonzero exit status when cleanup
cannot be confirmed. Browser connection loss must disable writes and identify
the displayed state as the last known state. Reconnect by fetching server state.

The `panelfaults` build tag belongs only to the separately named acceptance-test
executable. It injects a single termination denial or an unconfirmed request
while real owned processes keep running. Production builds have no fault marker
or environment switch. Keep this distinction explicit in verification reports.
