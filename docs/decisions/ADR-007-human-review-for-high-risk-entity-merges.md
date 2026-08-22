# ADR-007: Human review for high-risk entity merges

## Status

Accepted for v1.0.0.

## Context

An incorrect entity merge can combine facts from different products or providers and contaminate every downstream view. Similar names alone are not sufficient evidence, especially when lifecycle or provider identifiers conflict.

## Decision

Require explicit human approval for high-risk or ambiguous entity merges. Persist match features and scores, audit merge and split actions, and keep identity history reversible without deleting source observations.

## Alternatives

- Automatically merge above a similarity threshold.
- Require manual review for every identity match.
- Never merge records across sources.

## Consequences

Risky identity changes remain explainable and reversible, at the cost of a review queue. Deterministic high-confidence matches can proceed under policy, while conflicts and incompatible lifecycles remain blocked.

## Reversal conditions

Broaden automatic merging only after labeled benchmarks establish an acceptable false-merge rate for each affected entity class and the policy owner approves the threshold, rollback procedure, and ongoing monitoring.
