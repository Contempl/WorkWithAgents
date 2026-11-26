---
status: accepted
---

# Use Go for the server and React with TypeScript for the interface

Choose a Go server and a React interface written in TypeScript. The learning goal
is to explore Go on a concrete systems task while retaining a familiar direction
for the browser interface. The first version targets the user's Windows computer.

Use the Go standard library's HTTP server as the starting point and Vite to build
the browser assets. One Go server will serve the interface and API locally. The
startup contract is defined in [the case instructions](../../AGENTS.md).

## Alternatives considered

- **C# / ASP.NET Core with React / TypeScript:** fits the requirements and the
  user's prior experience, but offers less opportunity to explore a new language.
- **Node.js / TypeScript for both server and interface:** shares a language across
  the application, but the user chose to try Go for this learning project.
- **Rust with a TypeScript interface:** also an interesting learning option, but
  introduces ownership and borrowing alongside process management. Go was chosen
  to keep the initial language-learning load smaller.

## Consequences

Development requires Go and Node.js/npm. Keep server and interface responsibilities
separate so either can evolve. Data storage and detailed implementation structure
remain for specification; this decision does not select a database.

Windows process-tree termination and cleanup after an abnormal server exit still
require a technical prototype. This stack choice does not establish those
capabilities as verified. The interactive HTML prototype only validated the
user's understanding of the product workflow.
