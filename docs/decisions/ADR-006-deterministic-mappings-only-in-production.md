# ADR-006: Deterministic mappings only in production

## Status

Accepted for v1.0.0.

## Context

Mapping collector output into canonical fields affects meaning, units, identity, and downstream events. A runtime model call can vary across executions and cannot provide the reproducible input-to-output contract required for release.

## Decision

Run only versioned deterministic mapping specifications in the production release path. AI may draft a mapping proposal, but a human must review it, convert it into a deterministic specification, and run regression tests before activation.

## Alternatives

- Map each row with an LLM at runtime.
- Hard-code all mappings without revision metadata.
- Allow source-specific consumers to reinterpret raw rows.

## Consequences

Mappings are replayable, diffable, testable, and attributable to a revision. Novel layouts may require a review cycle, and the mapping language must be extended deliberately when it cannot express a valid transform.

## Reversal conditions

Permit a non-deterministic transform only after it can meet the same replay, provenance, held-out-test, rollback, and audit guarantees under an approved risk policy. Until then it may operate only in advisory or shadow mode.
