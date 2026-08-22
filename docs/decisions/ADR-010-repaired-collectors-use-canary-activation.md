# ADR-010: Repaired collectors use canary activation

## Status

Accepted for v1.0.0.

## Context

A collector repair that succeeds on the triggering page can still regress other layouts or turn negative controls into false positives. Immediate fleet-wide activation would make the repair proposal its own authority.

## Decision

Activate repaired collector behavior through a canary gate. Require reviewed evidence, visible mutations, held-out cases, negative controls, a digest-bound certificate, and rollback information before resuming normal release. Continue serving last-known-good facts during evaluation.

## Alternatives

- Activate a provider-generated repair immediately.
- Reject all automated repair proposals and patch only by hand.
- Test only the page that originally failed.

## Consequences

Recovery is slower than immediate activation but measures both successful repair and false-heal risk. Canary fixtures and evidence must be maintained, and certification failure leaves the source quarantined rather than silently degraded.

## Reversal conditions

Replace this canary process only when another activation mechanism provides equivalent held-out and negative-control coverage, independent approval, audit evidence, bounded rollout, and tested rollback.
