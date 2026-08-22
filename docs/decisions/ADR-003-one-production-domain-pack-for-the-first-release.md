# ADR-003: One production domain pack for the first release

## Status

Accepted for v1.0.0.

## Context

Canonical schemas, mappings, identity policy, contracts, mutations, and source authority all require domain expertise. Spreading the first release across unrelated domains would trade verification depth for collector count.

## Decision

Use `ai-infrastructure` as the first production semantic domain pack. Keep product pricing, including the controlled Nova source, as the regression and repair-certification proof that exercises the trust kernel.

## Alternatives

- Launch several shallow production domain packs.
- Make the controlled product-pricing fixture the only domain.
- Build a generic ontology that accepts arbitrary customer fields.

## Consequences

The release can demonstrate pricing, catalog, and changelog source archetypes within one coherent model. Breadth is limited, and new verticals require their own contracts and governance instead of inheriting unsupported assumptions.

## Reversal conditions

Add or promote another domain pack only when it has an owner, governed sources, canonical schema, deterministic mappings, identity rules, mutation profile, replay cases, and measured release gates comparable to the first pack.
