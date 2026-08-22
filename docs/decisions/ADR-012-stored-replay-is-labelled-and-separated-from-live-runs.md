# ADR-012: Stored replay is labelled and separated from live runs

## Status

Accepted for v1.0.0.

## Context

Stored collector outputs make mapping, identity, incident, and demo workflows reproducible without depending on a live website. If replay results are presented as live acquisition, users cannot distinguish current source evidence from a deterministic fixture.

## Decision

Label stored replay explicitly and keep its run provenance separate from live Bright Data collection. Replay may exercise the same downstream verification logic, but it must retain the original capture reference and must not refresh source freshness or count as a new live collector run.

## Alternatives

- Feed stored and live inputs through an indistinguishable run type.
- Disallow replay and require network collection for every test.
- Maintain an entirely separate verification implementation for fixtures.

## Consequences

Developers can reproduce failures and demos while release claims remain honest about evidence origin. Run models and UI need provenance labels, and replay proves deterministic behavior rather than present-day source availability.

## Reversal conditions

The implementation may unify transport plumbing only if provenance remains unambiguous in storage, APIs, metrics, and UI. The distinction between replay evidence and a newly captured live run must never be removed.
