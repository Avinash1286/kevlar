# ADR-009: Source absence is not fact removal

## Status

Accepted for v1.0.0.

## Context

A missing row can mean an outage, block, pagination change, collector regression, or a real retirement. Treating one absence as deletion would emit false removal events during routine source failures.

## Decision

Do not remove or retire a released fact from source absence alone. Preserve last-known-good data with freshness status, record the absence, and require explicit source semantics or sufficient corroborating evidence under release policy before removal.

## Alternatives

- Delete facts immediately when a run omits them.
- Ignore absence indefinitely without freshness signals.
- Let each downstream consumer infer removal.

## Consequences

Transient failures do not create false deletions. Facts may remain visible while stale, so freshness labels, source-health alerts, repeated-absence handling, and explicit lifecycle predicates are necessary.

## Reversal conditions

A source may support absence-based removal only when its documented contract guarantees complete snapshots and explicit tombstone semantics, repeated tests prove the behavior, and a predicate-specific release policy authorizes it.
