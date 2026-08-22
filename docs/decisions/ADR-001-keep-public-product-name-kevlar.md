# ADR-001: Keep public product name Kevlar

## Status

Accepted for v1.0.0.

## Context

The repository, hosted application, release artifacts, packages, and documentation need one stable product identity. Using separate public and internal names would make collector evidence, certificates, links, and hackathon material harder to connect.

## Decision

Use **Kevlar** as the public product name. Workspace package names may use the `@kevlar/` scope, and descriptive subsystem names such as Tribunal or Gauntlet remain features of Kevlar rather than separate products.

## Alternatives

- Keep Kevlar only as an internal codename and introduce a different public brand.
- Give each subsystem an independent product name.
- Delay naming until after the first release.

## Consequences

Documentation and deployed surfaces use one recognizable name. A future rename would affect URLs, package scopes, release evidence, screenshots, and explanatory material, so casual renaming becomes intentionally expensive.

## Reversal conditions

Reverse this decision only for a material legal, trademark, safety, or business requirement. A reversal requires an explicit migration plan covering repository text, public URLs, package names, certificates, artifacts, and compatibility aliases.
