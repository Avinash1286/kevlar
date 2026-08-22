# Architecture

Kevlar has four planes:

- Data: collectors, normalization, observations, facts, events, and delivery.
- Control: projects, source policy, scheduling, approvals, and release policy.
- Trust: contracts, triage, Tribunal, Gauntlet, evidence, and certificates.
- Developer: REST, webhooks, SDK, MCP, documentation, and usage metering.

The dependency direction is one-way: shared types and hashing feed normalization; verification and provenance feed tribunal and certification; canonical intelligence feeds delivery. UI, Convex, and external providers depend on pure packages, never the reverse.

The first invariant is `collector row != verified observation != released field`. No later subsystem may read around the release gate.

## End-to-end data flow

```text
governed public source
  -> custom Bright Data collector
  -> immutable raw run, row, and evidence references
  -> source contract and deterministic mapping revision
  -> canonical observation with field-level provenance
  -> reviewed entity identity
  -> predicate-specific release policy
  -> append-only bitemporal fact version
  -> derived current fact and semantic event
  -> evidence bundle and certificate
  -> REST / signed webhook / SDK / read-only MCP / reviewed AI-router proposal
```

An error takes a separate fail-closed branch:

```text
contract or semantic failure
  -> quarantine + last-known-good service
  -> deterministic triage
  -> Bright Data repair proposal
  -> authorized review
  -> canary + visible, held-out, and negative-control Gauntlet
  -> certificate and release, or continued quarantine
```

## Trust boundaries

1. **Network to acquisition:** Only governed HTTPS host/path inputs may reach a custom collector. Provider credentials remain server-side.
2. **Acquisition to observation:** Collector output is untrusted. Schema shape, evidence, source policy, and semantic contracts are checked before verification.
3. **Observation to canonical data:** Only versioned deterministic mappings run in the release path. AI proposals remain advisory.
4. **Canonical data to identity:** Exact identifiers and reviewed aliases drive matching; high-risk merges require a human decision and remain reversible.
5. **Identity to fact:** Predicate-specific authority and reconciliation decide release, conflict, withholding, or last-known-good continuation.
6. **Fact to delivery:** REST, webhook, SDK, MCP, and router consumers receive released data. Raw rows cannot bypass the release decision.
7. **Tenant boundary:** Convex functions derive membership from authenticated identity and enforce project ownership before tenant-scoped data is returned or changed.

## State machines

The principal state transitions are explicit rather than inferred from missing records:

- source: `draft -> onboarding -> active -> paused/retired`;
- mapping: `draft -> shadow -> canary -> active`, with `rolled_back` as a terminal revision state;
- canonical field: `verified | quarantined | last_known_good | stale | needs_review`;
- release decision: `release | withhold | conflict | continue_last_known_good | no_change | blocked_quarantine | blocked_absence | needs_human_review`;
- event: `pending -> verified -> released`, or `withheld/superseded/retracted` with an explicit relation;
- repair: failure, quarantine, proposal, approval, canary, Gauntlet, certificate, then release or continued quarantine.

Source absence is an input to policy, not a deletion transition. Corrections append a new belief and relationship; they do not rewrite the prior observation or fact version.

## Data relationships

- An organization has memberships; a project is bound to an organization through tenancy records.
- A source owns endpoints, collector bindings, schedules, health records, and runs.
- A run owns raw rows and evidence references. A verified observation retains its run and evidence lineage.
- A canonical observation records the schema and deterministic mapping revisions used for each field.
- Identity decisions connect source keys and aliases to canonical entities, with auditable merge/split lineage.
- Fact versions belong to an entity and predicate. `currentFacts` is a derived pointer to the current released version, not the historical authority.
- Release decisions can open conflicts or create change events. Events reference the fact transition that caused them.
- Evidence bundles connect observations, mappings, decisions, certificates, and blast-radius records.
- API keys, subscriptions, webhook endpoints, attempts, and deliveries remain tenant-scoped and reference released resources.

The Convex schema is the executable inventory of these relationships. Public queries use bounded indexes rather than scanning unbounded histories.

## Workflow idempotency

Multi-step work persists state before and after external operations. High-impact mutations use an `operationKey`; a retry either resumes or returns the prior result instead of applying the transition twice. Collector snapshot IDs, provider job references, event IDs, delivery IDs, and webhook attempt records provide reconciliation points across process restarts.

Webhook delivery uses stable event and delivery identities so consumer retries do not create a new business event. Scheduling uses leases and bounded work; an expired worker can be recovered without treating the same run as two independent observations.

## Evidence lineage

Evidence is referenced, hashed, and propagated rather than copied into an untraceable summary:

```text
source URL + capture time
  -> raw context / JSON-LD / public response / screenshot reference
  -> observation and field provenance
  -> mapping + identity + release decision
  -> fact version + semantic event
  -> evidence bundle + integrity digest + certificate
  -> downstream event or API response
```

An integrity digest can detect content mismatch; it is not a digital signature or proof of author identity. Bulky evidence can be redacted under retention policy while its historical decision and digest remain auditable.

## Deployment boundary

Vercel hosts the public web and API surface. Convex provides the backend data and function runtime. Bright Data Scraper Studio remains the central acquisition and repair runtime. The v1.0.0 release evidence names the proven Convex development deployment; promoting a separate production deployment is an explicit operation outside that evidence.

See the [decision records](DECISIONS.md), [trust model](TRUST.md), [source governance](SOURCE_GOVERNANCE.md), and [temporal model](TEMPORAL.md) for the governing policies behind these boundaries.
