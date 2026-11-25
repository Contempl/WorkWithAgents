---
status: accepted
---

# Manage only panel-launched project processes

The Panel manages only the processes it launches for registered Projects and
their descendants, so lifecycle control must retain the association between a
Project and its launched processes. We reject stopping arbitrary processes by
port or treating all processes started from a project folder as panel-owned:
either approach could terminate an unrelated service or another terminal's work.
Supporting externally launched processes later requires an explicit ownership
design rather than broadening the stop operation implicitly.
