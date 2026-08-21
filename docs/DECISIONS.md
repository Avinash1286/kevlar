# Architecture decisions

## ADR-001: One monorepo and one product name

Status: accepted.

Kevlar uses a pnpm/Turborepo workspace with Next.js applications, pure TypeScript packages, Convex functions, collector assets, domains, tests, samples, and documentation. The public name remains Kevlar.

## ADR-002: Collector output is untrusted

Status: accepted.

Structurally valid collector output is persisted as an observation candidate, not promoted as a fact. Verification and evidence gates are deterministic; AI may explain or propose but cannot approve truth.

## ADR-003: Provider code stays behind typed boundaries

Status: accepted.

Bright Data, Convex, and AI-provider calls live behind typed adapters. Pure trust logic remains independently testable and provider-agnostic.
