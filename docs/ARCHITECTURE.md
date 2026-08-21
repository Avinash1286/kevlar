# Architecture

Kevlar has four planes:

- Data: collectors, normalization, observations, facts, events, and delivery.
- Control: projects, source policy, scheduling, approvals, and release policy.
- Trust: contracts, triage, Tribunal, Gauntlet, evidence, and certificates.
- Developer: REST, webhooks, SDK, MCP, documentation, and usage metering.

The dependency direction is one-way: shared types and hashing feed normalization; verification and provenance feed tribunal and certification; canonical intelligence feeds delivery. UI, Convex, and external providers depend on pure packages, never the reverse.

The first invariant is `collector row != verified observation != released field`. No later subsystem may read around the release gate.
