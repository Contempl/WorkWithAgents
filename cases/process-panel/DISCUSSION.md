# Process Panel: design discussion

Status: initial scope accepted after reviewing an interactive walkthrough.
This is the handoff from product discovery to stack selection and specification.

## Purpose

A personal, local browser application for managing development projects from
one place. This is a learning project; the user has not reported a recurring
problem with forgotten servers or frequent use of `npm run dev`.

## Agreed first-version scope

- Register a project with its name, folder, and launch command.
- List projects and show whether each is running or stopped.
- Start a project and stop its launched process together with its descendants.
- View the launched program's output.
- Manage programs launched by the panel. Discovery of programs started in other
  terminals is a possible later extension.

Terminology is defined in [GLOSSARY.md](GLOSSARY.md).

## Agreed behavior

- Retain project registrations between panel sessions.
- Allow at most one active execution per project; different projects can run
  concurrently. Disable starting a project while it is already running.
- Closing the browser tab leaves the panel and its projects running. Reopening
  the interface shows their current state.
- On normal panel shutdown, stop the projects it launched, including descendants.
- Show output from the current execution without a persistent archive. Keep the
  output after the program stops until the project's next launch or panel shutdown.
- Exercise the first version with a small purpose-built local server that can be
  started, opened in a browser, and stopped. The server is an example project;
  the panel accepts project launch commands rather than requiring `npm run dev`.
- Present these lifecycle states: Stopped, Starting, Running, Stopping, and Error.
  Show the reason and available program output when starting or stopping fails.
  Report a failed stop as a failure rather than marking the project as stopped.
- On a launch failure caused by an occupied port, show the error and leave the
  unrelated process running. The ownership boundary and its rationale are recorded
  in [ADR-0001](docs/adr/0001-manage-only-panel-launched-processes.md).
- Permit editing and removing registrations only while their projects are stopped.
  Removing a registration preserves the project's folder and files.
- Desired crash behavior: terminate launched projects and their descendants if
  the panel itself exits abnormally. After restarting the panel, retain project
  registrations and require an explicit user action to start each project again.
  Crash cleanup remains subject to the technical validation below.

## Technical validation before stack selection

Use a disposable prototype on the user's Windows computer to verify that a
candidate stack can stop a launched program and its descendants, including when
the panel exits abnormally. Include an unrelated process to verify the ownership
boundary. This is a requirement to validate, not a capability already demonstrated.
Record the observed result before committing to a stack or promising crash cleanup.

## Interaction prototype

Question: does an interactive example make the purpose and basic controls of the
panel understandable? The user tried the mockup, described the panel as a more
convenient layer for managing their own projects, and chose to continue with this
scenario as a learning project.

The prototype simulates processes; it provides evidence about understanding the
workflow, not operating-system process control. Its source is preserved on the
[prototype/process-panel-interaction branch](https://github.com/Contempl/WorkWithAgents/tree/prototype/process-panel-interaction/cases/process-panel).
Open `process-panel.prototype.html` from that branch directly in a browser.

## Next steps

Compare two or three technology stacks against these requirements and
the user's ability to understand and maintain the code. Validate the process
lifecycle requirement above before settling a stack. Record the stack choice and
rejected alternatives in a separate ADR. Once chosen, document the startup command
and local URL in a case-level AGENTS.md, linked from the root AGENTS.md.
No stack, startup command, or listening port has been selected yet.
