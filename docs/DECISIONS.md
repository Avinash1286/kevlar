# Architecture decisions

Kevlar's v1.0.0 architecture is governed by the accepted records below. Each record states its context, decision, considered alternatives, consequences, and the conditions required to reverse it.

| ADR                                                                                    | Decision                                               | Status   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------- |
| [ADR-001](decisions/ADR-001-keep-public-product-name-kevlar.md)                        | Keep public product name Kevlar                        | Accepted |
| [ADR-002](decisions/ADR-002-make-the-verification-boundary-foundational.md)            | Make the verification boundary foundational            | Accepted |
| [ADR-003](decisions/ADR-003-one-production-domain-pack-for-the-first-release.md)       | One production domain pack for the first release       | Accepted |
| [ADR-004](decisions/ADR-004-convex-append-only-fact-history.md)                        | Convex append-only fact history                        | Accepted |
| [ADR-005](decisions/ADR-005-rest-and-webhooks-before-graphql.md)                       | REST + webhooks before GraphQL                         | Accepted |
| [ADR-006](decisions/ADR-006-deterministic-mappings-only-in-production.md)              | Deterministic mappings only in production              | Accepted |
| [ADR-007](decisions/ADR-007-human-review-for-high-risk-entity-merges.md)               | Human review for high-risk entity merges               | Accepted |
| [ADR-008](decisions/ADR-008-ai-is-advisory-never-release-authority.md)                 | AI is advisory, never release authority                | Accepted |
| [ADR-009](decisions/ADR-009-source-absence-is-not-fact-removal.md)                     | Source absence is not fact removal                     | Accepted |
| [ADR-010](decisions/ADR-010-repaired-collectors-use-canary-activation.md)              | Repaired collectors use canary activation              | Accepted |
| [ADR-011](decisions/ADR-011-integrity-digests-are-not-digital-signatures.md)           | Integrity digests are not digital signatures           | Accepted |
| [ADR-012](decisions/ADR-012-stored-replay-is-labelled-and-separated-from-live-runs.md) | Stored replay is labelled and separated from live runs | Accepted |

Changing an accepted decision requires editing its record or adding a superseding ADR. Code changes alone do not reverse an ADR.
