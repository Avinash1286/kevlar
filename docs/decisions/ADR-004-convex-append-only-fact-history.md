# ADR-004: Convex append-only fact history

## Status

Accepted for v1.0.0.

## Context

Kevlar must distinguish an external change from a correction to an earlier belief and answer both current and historical questions. Updating a fact in place destroys the evidence needed for that distinction.

## Decision

Store observations and fact versions as append-only historical records in Convex. Represent valid time and transaction time explicitly. Derive the current-fact materialized view from released fact versions; corrections supersede prior beliefs without deleting them.

## Alternatives

- Update one current record in place.
- Store history only in application logs.
- Put the authoritative history in a separate event-store service for v1.

## Consequences

History, corrections, provenance, and as-of queries remain explainable. Storage grows over time, so indexes, bounded queries, retention of bulky evidence, and repair-safe materialization are required.

## Reversal conditions

Move authoritative history away from Convex only after another append-only store proves equivalent identity, provenance, bitemporal queries, tenant isolation, and migration reconciliation. In-place destructive history remains disallowed.
