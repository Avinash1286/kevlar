# ADR-005: REST + webhooks before GraphQL

## Status

Accepted for v1.0.0.

## Context

The first release needs predictable reads, replayable event delivery, scoped API keys, and an integration path that can be demonstrated and secured within the release window. A general query language would enlarge the authorization and performance surface.

## Decision

Ship versioned REST reads and signed, idempotent webhooks first. Keep the TypeScript SDK as a typed wrapper over those contracts and keep MCP read-only. GraphQL is outside v1.0.0.

## Alternatives

- Build GraphQL as the primary interface.
- Offer REST polling without webhooks.
- Expose direct database queries to integrators.

## Consequences

Endpoints, scopes, quotas, delivery attempts, and replay behavior are explicit and testable. Clients cannot compose arbitrary graphs in one request, and new read shapes require versioned endpoint work.

## Reversal conditions

Add GraphQL when measured client demand justifies it and field-level authorization, complexity limits, released-fact-only resolvers, observability, and compatibility policy are designed and tested.
