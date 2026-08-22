# ADR-002: Make the verification boundary foundational

## Status

Accepted for v1.0.0.

## Context

A collector can return structurally valid data whose meaning is wrong. Publishing a row immediately after schema validation would let silent corruption reach facts, events, APIs, and AI consumers.

## Decision

Enforce the invariant `collector row != verified observation != released field`. Raw acquisition, verification, and release are distinct states. All downstream product surfaces consume released facts or events and may not read around the release gate.

## Alternatives

- Treat schema-valid collector rows as facts.
- Verify only at API-read time.
- Let each downstream consumer choose its own trust policy.

## Consequences

Semantic corruption can be quarantined while last-known-good data remains available. The design adds state transitions, evidence storage, and release latency, but gives every consumer one consistent trust boundary.

## Reversal conditions

Reverse only if Kevlar is deliberately re-scoped as an unverified raw-data transport. That change must rename affected interfaces, prevent raw results from being described as facts, and migrate every existing downstream dependency explicitly.
