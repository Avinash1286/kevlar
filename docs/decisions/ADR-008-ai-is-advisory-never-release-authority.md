# ADR-008: AI is advisory, never release authority

## Status

Accepted for v1.0.0.

## Context

AI is useful for diagnosis and drafting repair or mapping proposals, but model output may be inconsistent, unavailable, or influenced by untrusted page content. Release authority changes externally visible facts and downstream actions.

## Decision

AI may summarize evidence, classify ambiguous cases, and propose repairs, mappings, or router changes. It may not approve repairs, merge high-risk identities, release facts, fabricate evidence, or activate production routes. Deterministic gates and authorized human decisions retain authority.

## Alternatives

- Allow a model confidence score to release facts automatically.
- Remove AI from the product entirely.
- Delegate authority independently in each subsystem.

## Consequences

Provider outages do not block deterministic core decisions, and prompt injection cannot itself authorize a release. Some workflows take longer and require review, but the system can state precisely who or what approved every high-impact transition.

## Reversal conditions

Any delegation of authority requires a new ADR, an explicit risk owner, bounded action scope, adversarial evaluation, deterministic fail-closed controls, auditability, rollback, and a demonstrated error rate acceptable for the affected impact class.
