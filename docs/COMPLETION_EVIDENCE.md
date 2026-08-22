# Completion evidence

This audit maps the Week 1–4 exit gates and the release Definition of Done in
[`complete_kevlar.md`](../complete_kevlar.md) to repository, test, artifact, and
deployment evidence. A checked item means the repository or an already-verified
deployment proves it; it does not turn a provider-side or human assertion into
software evidence.

Audit date: **2026-08-22**.

Evidence snapshot:

- [`benchmarks/results/v1.0.1.json`](../benchmarks/results/v1.0.1.json) records
  24/24 controlled checks and zero false releases.
- [`benchmarks/results/v1.0.1-e2e.json`](../benchmarks/results/v1.0.1-e2e.json)
  records seven passing full-flow assertions and 17/17 healthy production pages.
- [`benchmarks/results/v1.0.1-load.json`](../benchmarks/results/v1.0.1-load.json)
  records 80/80 successful production requests.
- The release workspace passed `pnpm test`, `pnpm typecheck`, and `pnpm build`.
- A strict credential-pattern scan of every Git patch, tracked files, and the
  built web client found **0** matches. Empty placeholders in `.env.example`
  were not treated as credentials.
- Live HTTP verification returned `200` for the
  [fixture](https://kevlar-fixture-lab.vercel.app/product-pricing/nova) and the
  [operator console](https://kevlar-web.vercel.app). The five governed provider
  pages were also publicly readable; the OpenAI pricing URL redirects to its
  current public pricing page.
- Release tag [`v1.0.1`](https://github.com/Avinash1286/kevlar/releases/tag/v1.0.1)
  and the application rollback procedure in [`RECOVERY.md`](RECOVERY.md#application-release-rollback)
  exist.

Status values are **Proven**, **External**, **Manual**, and **Open**.

## Week 1 exit gate

| Requirement                                    | Status | Evidence                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture is publicly reachable                  | Proven | Live [`/product-pricing/nova`](https://kevlar-fixture-lab.vercel.app/product-pricing/nova) returned `200`; implementation is [`page.tsx`](../apps/fixture-lab/app/product-pricing/nova/page.tsx).                                                                                                       |
| Bright Data runs a custom collector            | Proven | Stable [`c_mt3utzwt29hbznvax9`](../collectors/product-pricing/nova/collector-id.txt), reviewed [`interaction.js`](../collectors/product-pricing/nova/interaction.js), [`parser.js`](../collectors/product-pricing/nova/parser.js), and [collector notes](../collectors/product-pricing/nova/README.md). |
| Structured extraction occurs in Scraper Studio | Proven | The verified provider preview used the source-controlled interaction/parser pair; the boundary and API sequence are recorded in [`BRIGHT_DATA.md`](BRIGHT_DATA.md).                                                                                                                                     |
| Raw output reaches Convex                      | Proven | [`runs:ingestBaseline`](../convex/runs.ts), [`semanticGate:ingestObservation`](../convex/semanticGate.ts), and the Phase 4 proof ID in the [live E2E result](../benchmarks/results/v1.0.1-e2e.json).                                                                                                    |
| Evidence references are persisted              | Proven | Evidence insertion is enforced by [`semanticGate.ts`](../convex/semanticGate.ts) and exposed by [`phase4Queries.ts`](../convex/phase4Queries.ts).                                                                                                                                                       |
| Collector ID and schemas are documented        | Proven | [`collector-id.txt`](../collectors/product-pricing/nova/collector-id.txt), [`input-schema.json`](../collectors/product-pricing/nova/input-schema.json), and [`output-schema.json`](../collectors/product-pricing/nova/output-schema.json).                                                              |
| Baseline is reproducible from a clean clone    | Proven | [Clean setup](../README.md#clean-setup), [`Makefile`](../Makefile), [`demo-reset.ts`](../scripts/demo-reset.ts), lockfile, and the passing release build/test snapshot above.                                                                                                                           |
| No credential appears in Git history           | Proven | The 2026-08-22 full-history credential-pattern scan returned zero matches.                                                                                                                                                                                                                              |

## Week 2 exit gate

| Requirement                                               | Status | Evidence                                                                                                                                                            |
| --------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same URL changes while one-time price remains stable      | Proven | Fixture state is switched by [`fixture-state.ts`](../apps/fixture-lab/lib/fixture-state.ts) while the public route stays constant.                                  |
| Baseline collector returns valid but wrong JSON           | Proven | `novaSemanticSwap` in [`test-fixtures`](../packages/test-fixtures/src/index.ts) is schema-valid and swaps `$129` with `$10.75`.                                     |
| Critical semantic contract catches the mistake            | Proven | [`semantic-contracts.test.ts`](../tests/unit/semantic-contracts.test.ts) asserts `semantic_swap`, independent-source mismatch, and quarantine.                      |
| Core decision does not need AI                            | Proven | The same test calls the pure [`semantic-contracts`](../packages/semantic-contracts/src/index.ts) package directly.                                                  |
| False alert is blocked                                    | Proven | The semantic-swap test asserts `alert.status === "blocked"`.                                                                                                        |
| Previous verified value stays available and visibly stale | Proven | The test asserts observed `$10.75`, served `$129`, and `state === "stale"`; [`/feed`](../apps/web/app/feed/page.tsx) renders the state.                             |
| Core contract tests pass                                  | Proven | [`foundation.test.ts`](../tests/unit/foundation.test.ts) and [`semantic-contracts.test.ts`](../tests/unit/semantic-contracts.test.ts) pass in the release test run. |

## Week 3 exit gate

| Requirement                                       | Status | Evidence                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `semantic_swap` recommends `heal`                 | Proven | Parameterized assertion in [`triage.test.ts`](../tests/unit/triage.test.ts).                                                                                                                                                   |
| Transport failure recommends `retry`              | Proven | Parameterized assertion in [`triage.test.ts`](../tests/unit/triage.test.ts).                                                                                                                                                   |
| Soft block recommends `quarantine`                | Proven | N1 assertion in [`triage.test.ts`](../tests/unit/triage.test.ts).                                                                                                                                                              |
| Legitimate empty recommends `do_not_heal`         | Proven | N2 assertion in [`triage.test.ts`](../tests/unit/triage.test.ts).                                                                                                                                                              |
| All-provider failure reaches human review         | Proven | [`ai-router.test.ts`](../tests/unit/ai-router.test.ts) exercises exhausted providers and the human fallback.                                                                                                                   |
| Duplicate actions do not duplicate external calls | Proven | [`idempotency.ts`](../convex/idempotency.ts), workflow operation keys in [`workflows.ts`](../convex/workflows.ts), and explicit-idempotency tests in [`brightdata-runtime.test.ts`](../tests/unit/brightdata-runtime.test.ts). |
| Every state transition is audited                 | Proven | [`workflows.ts`](../convex/workflows.ts) appends audit events at workflow transitions; unsafe jumps are rejected by [`triage.test.ts`](../tests/unit/triage.test.ts).                                                          |

## Week 4 exit gate

| Requirement                                             | Status | Evidence                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Triggering failure is fixed                             | Proven | The certified Phase 4 flow is recorded by `repair_certificate_available: true` in the [E2E artifact](../benchmarks/results/v1.0.1-e2e.json) and implemented by [`run-phase4-core.ts`](../scripts/run-phase4-core.ts).                            |
| Four visible cases pass                                 | Proven | M1–M4 pass in [`v1.0.1.json`](../benchmarks/results/v1.0.1.json).                                                                                                                                                                                |
| Two held-out cases pass                                 | Proven | H1–H2 pass in the same raw benchmark.                                                                                                                                                                                                            |
| Two negative controls get no-heal behavior              | Proven | N1 is quarantined and N2 is `do_not_heal` in the same raw benchmark.                                                                                                                                                                             |
| No critical field is promoted before certification      | Proven | Release gating is tested by [`certification.test.ts`](../tests/unit/certification.test.ts) and persisted by [`phase4Certification.ts`](../convex/phase4Certification.ts).                                                                        |
| Last-known-good remains active during failure           | Proven | Raw benchmark baselines record `lastKnownGoodAvailable: true`; semantic-contract tests assert `$129` remains served.                                                                                                                             |
| Same Collector ID before and after repair is documented | Proven | The stable ID and workflow are recorded in the [Nova collector README](../collectors/product-pricing/nova/README.md); the certificate schema requires `same_id_before_after: true` in [`certification`](../packages/certification/src/index.ts). |
| Certificate is generated from measured results          | Proven | [`certification.test.ts`](../tests/unit/certification.test.ts), raw benchmark cases, and the live Phase 4 proof ID bind the certificate to measured results.                                                                                     |
| Full provider-backed flow works from `make demo-reset`  | Open   | [`demo-reset.ts`](../scripts/demo-reset.ts) resets fixture state only. The deterministic repair suites and existing deployed proof pass, but a fresh provider self-heal/approval/certification replay remains account-bound.                     |

## Definition of Done

### Core foundation and Bright Data centrality

| Requirement                                           | Status   | Evidence                                                                                                                                                                                        |
| ----------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture and complete provider repair work from reset  | Open     | Fixture reset is automated; the fresh Bright Data self-heal, approval, and certification replay remains provider-bound.                                                                         |
| Incident and certificate pages are accessible         | Proven   | [`incidents/[id]`](../apps/web/app/incidents/%5Bid%5D/page.tsx), [`certificates/[slug]`](../apps/web/app/certificates/%5Bslug%5D/page.tsx), and the E2E certificate assertion.                  |
| Core trust-kernel tests pass                          | Proven   | [`semantic-contracts.test.ts`](../tests/unit/semantic-contracts.test.ts), [`triage.test.ts`](../tests/unit/triage.test.ts), and [`certification.test.ts`](../tests/unit/certification.test.ts). |
| Verified price uses the product-pricing abstraction   | Proven   | [`semantic-contracts`](../packages/semantic-contracts/src/index.ts), Nova fixture, and [`released-fact.json`](../samples/released-fact.json).                                                   |
| Release rollback tag and procedure exist              | Proven   | Tag `v1.0.1` and the Vercel/Convex-safe procedure in [`RECOVERY.md`](RECOVERY.md#application-release-rollback).                                                                                 |
| Structured extraction occurs inside Scraper Studio    | Proven   | Week 1 provider-preview and collector-source evidence above.                                                                                                                                    |
| A new vertical collector completes a real self-heal   | External | The two new Anthropic collectors were activated by Bright Data but failed Kevlar schema certification; see [`HACKATHON_SUBMISSION.md`](HACKATHON_SUBMISSION.md#how-scraper-studio-is-central).  |
| Same-ID repair is demonstrated                        | Proven   | Nova same-ID evidence above.                                                                                                                                                                    |
| Preview, approval, and version evidence are preserved | Proven   | [`phase4Approval.ts`](../convex/phase4Approval.ts), [`phase4Queries.ts`](../convex/phase4Queries.ts), and the deployed Phase 4 proof.                                                           |
| Bright Data is central, not optional                  | Proven   | [`brightdata-runtime`](../packages/brightdata-runtime/src/index.ts), [`run-phase4-core.ts`](../scripts/run-phase4-core.ts), and [architecture](ARCHITECTURE.md).                                |

### Collector Mesh, canonical intelligence, and identity

| Requirement                                         | Status   | Evidence                                                                                                                                                                                                |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Six production-quality collectors are active        | External | Six stable IDs exist, but Anthropic pricing and models remain pending Kevlar certification in [`SOURCE_GOVERNANCE.md`](SOURCE_GOVERNANCE.md#source-register).                                           |
| Source policies and owners are documented           | Manual   | Policies and an owner role exist, but a named accountable human and terms sign-off are still required.                                                                                                  |
| Schedules, budgets, pause, run-now, and replay work | Proven   | [`phase5Catalog.ts`](../convex/phase5Catalog.ts), [`phase5Fleet.ts`](../convex/phase5Fleet.ts), [`run-phase5-fleet.ts`](../scripts/run-phase5-fleet.ts), and Phase 5 tests.                             |
| Fleet health is visible                             | Proven   | [`fleet/page.tsx`](../apps/web/app/fleet/page.tsx) and [`phase5Queries.ts`](../convex/phase5Queries.ts).                                                                                                |
| AI infrastructure schema revision 1 is active       | Proven   | [`v1.yaml`](../domains/ai-infrastructure/schema/v1.yaml), [`registry.ts`](../domains/ai-infrastructure/schema/registry.ts), and [`ai-infrastructure.test.ts`](../tests/unit/ai-infrastructure.test.ts). |
| Mappings are versioned and deterministic            | Proven   | [`specs.ts`](../domains/ai-infrastructure/mappings/specs.ts), [`phase6Mappings.ts`](../convex/phase6Mappings.ts), and Phase 6 tests.                                                                    |
| Canonical fields preserve source provenance         | Proven   | Provenance assertion in [`phase6-mapping-identity.test.ts`](../tests/unit/phase6-mapping-identity.test.ts).                                                                                             |
| Unit normalization tests pass                       | Proven   | Typed conversion cases in the same test file.                                                                                                                                                           |
| Mapping shadow and activation work                  | Proven   | Lifecycle transitions in [`phase6Mappings.ts`](../convex/phase6Mappings.ts) and deployed proof construction in [`phase6Proof.ts`](../convex/phase6Proof.ts).                                            |
| Stable canonical IDs                                | Proven   | [`identity`](../domains/ai-infrastructure/identity/index.ts) and Phase 6 exact-ID tests.                                                                                                                |
| External IDs and aliases are preserved              | Proven   | [`phase6Identity.ts`](../convex/phase6Identity.ts) and Phase 6 tests.                                                                                                                                   |
| Ambiguous matches enter review                      | Proven   | Phase 6 benchmark/test expected `needs_review`.                                                                                                                                                         |
| Merge and split are audited and reversible          | Proven   | Reversal assertion in Phase 6 tests and [`phase6Identity.ts`](../convex/phase6Identity.ts).                                                                                                             |
| Entity-resolution benchmark is committed            | Proven   | Three labelled cases in [`v1.0.1.json`](../benchmarks/results/v1.0.1.json).                                                                                                                             |

### Facts, history, semantic CDC, and reconciliation

| Requirement                                      | Status | Evidence                                                                                                                     |
| ------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Verified observations are immutable              | Proven | [`phase6Canonical.ts`](../convex/phase6Canonical.ts), append-only schema, and Phase 7 tests.                                 |
| Current facts derive from append-only versions   | Proven | [`phase7Facts.ts`](../convex/phase7Facts.ts) and current-projection regeneration test.                                       |
| Valid and transaction time are supported         | Proven | [`phase7-bitemporal-history.test.ts`](../tests/unit/phase7-bitemporal-history.test.ts).                                      |
| Real changes differ from corrections             | Proven | Phase 7 and Phase 8 tests.                                                                                                   |
| Historical queries work                          | Proven | [`phase7Queries.ts`](../convex/phase7Queries.ts), [`/history`](../apps/web/app/history/page.tsx), and E2E history assertion. |
| Last-known-good and staleness are visible        | Proven | Phase 7 stale fallback test and [`/feed`](../apps/web/app/feed/page.tsx).                                                    |
| Presentation-only changes emit no business event | Proven | [`phase8-semantic-cdc.test.ts`](../tests/unit/phase8-semantic-cdc.test.ts).                                                  |
| Real fact changes emit deterministic events      | Proven | Phase 8 exact-one-event test.                                                                                                |
| Duplicate runs do not duplicate events           | Proven | Stable-ID retry assertion in Phase 8 tests.                                                                                  |
| Corrections and retractions work                 | Proven | Correction/retraction assertions and [`phase8Cdc.ts`](../convex/phase8Cdc.ts).                                               |
| Event precision and recall are measured          | Proven | Labelled semantic-event section in [`v1.0.1.json`](../benchmarks/results/v1.0.1.json).                                       |
| Events link to evidence and release policy       | Proven | [`phase9-evidence-fleet.test.ts`](../tests/unit/phase9-evidence-fleet.test.ts) and deployed E2E assertion.                   |
| Predicate-specific authority works               | Proven | Phase 8 equivalence/authority tests and [`phase8Policies.ts`](../convex/phase8Policies.ts).                                  |
| Conflicts are explicit                           | Proven | Phase 8 source-conflict test and [`/conflicts`](../apps/web/app/conflicts/page.tsx).                                         |
| Unsupported new values can be withheld           | Proven | Quarantine and independent-quorum tests in Phase 8.                                                                          |
| Last-known-good continues through conflicts      | Proven | Phase 7 fallback plus Phase 8 reconciliation tests.                                                                          |
| Conflict resolution updates history/events       | Proven | `resolveConflict` and correction/retraction tests in [`phase8Cdc.ts`](../convex/phase8Cdc.ts).                               |

### Repair certification and developer platform

| Requirement                                        | Status | Evidence                                                                                                                              |
| -------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Blast radius is calculated                         | Proven | [`phase9-evidence-fleet.test.ts`](../tests/unit/phase9-evidence-fleet.test.ts).                                                       |
| Mapping and identity checks are in the Tribunal    | Proven | [`phase9Repair.ts`](../convex/phase9Repair.ts) and the Phase 9 proof/tests.                                                           |
| Repaired collectors run canary and held-out suites | Proven | Phase 9 canary/held-out tests.                                                                                                        |
| False semantic events block certification          | Proven | Phase 9 wrong-event test.                                                                                                             |
| Extended certificates come from real results       | Proven | Phase 9 certificate test and deployed Phase 9 proof ID.                                                                               |
| Failed candidates cannot release                   | Proven | Phase 9 rollback/withholding tests.                                                                                                   |
| API v1 exposes all required resources              | Proven | [`API.md`](API.md) and [`api/v1`](../apps/web/app/api/v1/%5B...resource%5D/route.ts).                                                 |
| API keys are hashed and scoped                     | Proven | [`phase10External.ts`](../convex/phase10External.ts), [`phase10Admin.ts`](../convex/phase10Admin.ts), and Phase 10 scope/authz tests. |
| Pagination and standard errors work                | Proven | [`api-contracts`](../packages/api-contracts/src/index.ts), API route, and Phase 10 tests.                                             |
| Webhooks are HMAC-signed                           | Proven | Phase 10 signature/tamper tests.                                                                                                      |
| Retry, dead-letter, and replay work                | Proven | Phase 10 delivery test and [`phase10Deliveries.ts`](../convex/phase10Deliveries.ts).                                                  |
| TypeScript SDK is locally installable              | Proven | Workspace [`@kevlar/sdk`](../packages/sdk/package.json) and SDK/API schema parity test.                                               |
| Read-only MCP works                                | Proven | [`mcp-server`](../packages/mcp-server/src/index.ts) and Phase 10 MCP test.                                                            |
| Trust metadata is present across API/SDK/MCP       | Proven | Shared schemas and Phase 10 evidence-aware result tests.                                                                              |

### Downstream integration, security, and operations

| Requirement                                                   | Status | Evidence                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router receives a verified event                              | Proven | [`ai-router.test.ts`](../tests/unit/ai-router.test.ts), Phase 11 tests, and E2E assertion.                                                                                                                                                                    |
| Router verifies webhook signature                             | Proven | [`phase11-security-operations.test.ts`](../tests/unit/phase11-security-operations.test.ts).                                                                                                                                                                   |
| Router deduplicates event IDs                                 | Proven | Same test.                                                                                                                                                                                                                                                    |
| Critical changes require review/canary                        | Proven | Same test asserts apply is blocked before review.                                                                                                                                                                                                             |
| Quarantined data never updates router configuration           | Proven | Same test rejects quarantined and evidence-free events.                                                                                                                                                                                                       |
| Source allowlists and SSRF protection pass                    | Proven | URL-security cases in Phase 11 tests.                                                                                                                                                                                                                         |
| Prompt-injection tests pass                                   | Proven | Phase 11 isolation test and [`ai-router.test.ts`](../tests/unit/ai-router.test.ts).                                                                                                                                                                           |
| Cross-project authorization tests pass                        | Proven | [`phase11-convex-authz.test.ts`](../tests/unit/phase11-convex-authz.test.ts), [`phase10-authz-hardening.test.ts`](../tests/unit/phase10-authz-hardening.test.ts), and [`project-public-read-authz.test.ts`](../tests/unit/project-public-read-authz.test.ts). |
| API-key revocation works                                      | Proven | Audited `revokeApiKey` mutation in [`phase10Admin.ts`](../convex/phase10Admin.ts).                                                                                                                                                                            |
| Webhook replay and tampering tests pass                       | Proven | Phase 10 replay and HMAC tamper tests.                                                                                                                                                                                                                        |
| Secrets are absent from history/client bundles                | Proven | Zero-match scan recorded in the evidence snapshot.                                                                                                                                                                                                            |
| High-impact actions are audited                               | Proven | Phase 4/6/9/10/11 mutations append audit records; adversarial tests assert denial/audit behavior.                                                                                                                                                             |
| Collector, trust, intelligence, and delivery dashboards exist | Proven | [`/fleet`](../apps/web/app/fleet/page.tsx), [`/feed`](../apps/web/app/feed/page.tsx), [`/entities`](../apps/web/app/entities/page.tsx), and [`/developers`](../apps/web/app/developers/page.tsx).                                                             |
| Runbooks exist                                                | Proven | Six committed files in [`docs/runbooks`](runbooks).                                                                                                                                                                                                           |
| Replay is implemented and labelled                            | Proven | [`phase10Deliveries.ts`](../convex/phase10Deliveries.ts), Phase 10 replay tests, and [`API.md`](API.md).                                                                                                                                                      |
| Critical alerts are configured                                | Proven | Runbook-linked chaos alert test and [`OPERATIONS.md`](OPERATIONS.md).                                                                                                                                                                                         |
| Evidence export and backup procedures work                    | Proven | A fresh development snapshot export succeeded on 2026-08-22; [`phase12Recovery.ts`](../convex/phase12Recovery.ts), [`phase12.test.ts`](../convex/phase12.test.ts), and [`RECOVERY.md`](RECOVERY.md) cover manifests and verification.                         |
| Isolated restore drill succeeds                               | Open   | No Preview Deploy Key is available and preview creation is billing-gated. Same-project manifest verification is not represented as a restore; the exact throwaway restore procedure is in [`RECOVERY.md`](RECOVERY.md#restore-drill).                         |
| Usage and cost units are visible                              | Proven | [`operations/page.tsx`](../apps/web/app/operations/page.tsx) and Phase 11 proof.                                                                                                                                                                              |

### Presentation

| Requirement                                    | Status | Evidence                                                                                                                                                      |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo briefly shows Kevlar Core                 | Proven | [`kevlar-core-v1.0.1.webm`](../artifacts/demo/kevlar-core-v1.0.1.webm) and route sequence in [`record-release-demos.ts`](../scripts/record-release-demos.ts). |
| Demo shows a multi-source entity               | Proven | Full-platform recording visits `/sources` and `/entities`.                                                                                                    |
| Demo distinguishes page drift from fact change | Proven | Full-platform recording visits `/history` and `/events`; Phase 8 labels the cases.                                                                            |
| Demo shows self-healing and certification      | Proven | Core recording visits `/gauntlet`, `/fleet/repairs`, and `/evidence`.                                                                                         |
| Demo shows bitemporal history and evidence     | Proven | Full-platform recording visits `/history`; core visits `/evidence`.                                                                                           |
| Demo shows API/webhook/SDK/MCP consumption     | Proven | Full-platform recording visits `/developers`.                                                                                                                 |
| Demo shows AI-router integration               | Proven | Full-platform recording visits `/router`.                                                                                                                     |
| Demo ends with measured results                | Proven | The matched narration and final security proof are documented in [`HACKATHON_SUBMISSION.md`](HACKATHON_SUBMISSION.md#narration-matched-to-the-recording).     |

## Other remaining checklist items

### Manual attestations

- Source-usage/terms review.
- Named human source owner and evidence-retention appropriateness.
- Team size and one-team-only eligibility.
- Confirmation that main implementation began after kickoff.
- Confirmation that the fixture was created by the team.
- Team ability to explain the collector and major subsystems.
- Internal ownership and respectful-conduct attestations.

### External-provider or submission actions

- Re-preview, save, run, and Kevlar-certify the Anthropic pricing and model
  collectors. Their IDs are real, but both current outputs failed the contract.
- Promote Convex only if a production deployment is desired. The release is
  intentionally proven against `dev:veracious-eagle-977`; production promotion
  is not claimed.
- Upload the narrated, captioned under-three-minute demo to YouTube as public
  or unlisted, and verify it while signed out.
- Restore a fresh snapshot into a different throwaway preview deployment and
  query the critical records once a Preview Deploy Key is available.
- Replay the complete Nova provider self-heal/approval/certification flow from
  `make demo-reset` if a fresh end-to-end provider rehearsal is required.
- Enter identity, ratings, and feedback, then submit the official form.

### Genuinely open repository work

- None identified by this checklist audit. The remaining open items require
  provider-bound execution, submission actions, or human attestations.

No unchecked item is silently represented as complete. The two pending
Anthropic collectors must not be called Kevlar-certified or production-quality
until their account-bound previews and real outputs pass the committed schemas.
