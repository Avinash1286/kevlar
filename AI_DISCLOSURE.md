# AI coding-tool disclosure

OpenAI Codex was used as a coding assistant during Kevlar's development. Its work included reading the implementation plan, drafting and editing source code and documentation, proposing tests and fixes, running local verification commands, inspecting deployment state, and helping prepare the release audit.

The submitter performed account-bound setup and review that an assistant could not authorize, including work in Bright Data Scraper Studio and inspection of real collector output. AI assistance does not replace the submitter's responsibility to review, understand, and explain the submitted code. Repository history, committed tests, raw benchmark results, and deployment evidence are the basis for technical claims; no claim is considered proven merely because an AI produced it.

## Product AI boundary

Kevlar also contains an AI-advisory boundary as a product feature. AI may:

- summarize evidence and incidents;
- classify ambiguous failure information;
- draft mapping, repair, or router-change proposals.

AI may not:

- fabricate source evidence;
- approve a Bright Data repair;
- merge a high-risk entity;
- release a fact or event;
- activate a production route;
- bypass a deterministic contract, authorization check, or human-review gate.

These restrictions are architectural requirements, not statements that AI-generated output is inherently correct. See [ADR-008](docs/decisions/ADR-008-ai-is-advisory-never-release-authority.md) and the [trust model](docs/TRUST.md).
