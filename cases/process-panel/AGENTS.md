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

Implementation is planned for a later practice step. The command and address
below are the agreed target behavior; application code and package scripts do
not exist yet.

From `cases/process-panel/`, after the implementation's initial dependency setup:

```sh
npm start
```

Open **http://127.0.0.1:4000** in a browser.

Implement this command to build the browser interface and start the Go server,
which serves both the interface and API at that address. Bind to IPv4 loopback
only. If the port is occupied, report the error and leave the existing process
running. Use this document as the authoritative source for the launch command
and address.
