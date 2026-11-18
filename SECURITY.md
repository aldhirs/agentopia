# Security policy

Agentopia runs Claude Code on your machine and shows its terminal, so security issues matter.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub:
**Security → Report a vulnerability** on this repository
(<https://github.com/aldhirs/agentopia/security/advisories/new>).

Include what you found, how to reproduce it, and the impact. You will get a reply as soon as
possible; please give a reasonable time to fix it before disclosing it publicly.

## What is in scope

- The local hook receiver (`127.0.0.1`) and its token checks
- IPC between the renderer and the main process
- Anything that lets web content, agent output or another local process run code or read data
- The packaged app (Electron fuses, CSP, navigation and permission handling)

See [`docs/security-report.md`](docs/security-report.md) for the threat model and the tests that cover it.
Claude Code itself is out of scope; report those issues to Anthropic.
