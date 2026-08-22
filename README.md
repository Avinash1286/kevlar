# Kevlar

**The changing web, verified before it reaches your systems.**

Kevlar v1.0.0 is a repair-certification firewall and verified live-web intelligence platform. Bright Data custom collectors acquire and self-heal public sources; Kevlar keeps every row, repair, fact, and event behind deterministic contracts, independent evidence, explicit release policy, and human review where impact requires it.

Production operator console: <https://kevlar-web.vercel.app>

## What is complete

- Core trust kernel: semantic gate, deterministic triage, last-known-good service, Repair Tribunal, held-out Gauntlet, and digest-bound certificates.
- Intelligence plane: source catalog, deterministic mappings, reviewed entity identity, immutable bitemporal facts, conflicts, and semantic change events.
- Evidence and delivery: evidence bundles, fleet repair certification, scoped REST API, signed/replayable webhooks, TypeScript SDK, and read-only MCP.
- Product and operations: password authentication, organization RBAC, tenant isolation, verified-event AI router, alerts, runbooks, backup manifests, retention/deletion controls, and cost/freshness dashboards.

## Thirty-second proof

1. The Nova page shows a one-time purchase price of `$129` and financing of `$10.75/month`.
2. A structurally valid collector row swaps those meanings.
3. Schema-only validation accepts it; Kevlar's semantic gate quarantines it and continues serving `$129` as last-known-good.
4. Bright Data proposes a repair. Kevlar requires evidence, review, four visible mutations, two held-out mutations, and two negative controls before release.
5. A released fact carries history, evidence, freshness, and its certificate into REST, SDK, MCP, webhooks, and the reviewed AI-router consumer.

## Measured v1.0.0 result

The committed controlled benchmark passed 24/24 labeled checks with 0 false releases. Its single labeled silent-corruption case was caught, both held-out cases passed, both negative controls avoided false healing, all 9 triage cases were classified correctly, all 3 identity cases matched their labels, and all 3 predicted semantic events were correct. These are fixture-backed release measurements, not population-level accuracy claims. See [the report](docs/BENCHMARK.md) and [raw result](benchmarks/results/v1.0.0.json).

## Architecture

```text
public source → Bright Data collector → immutable raw observation
             → mapping + identity → evidence-backed candidate
             → release policy → bitemporal fact → semantic event
             → REST / webhook / SDK / MCP / reviewed AI router

                         incidents ─→ repair proposal
last-known-good service ← quarantine  → Tribunal → Gauntlet → certificate
```

The key invariant is `collector row != verified observation != released field`. UI, delivery, and AI consumers cannot read around the release boundary.

## Clean setup

Requirements: Node.js 22+ and pnpm 10.33.0.

```bash
git clone https://github.com/Avinash1286/kevlar.git
cd kevlar
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Hosted proof scripts additionally use a local `.env.local` copied from `.env.example`. Never commit it. Local web development:

```bash
pnpm dev:web
pnpm dev:fixture
```

## Release verification

```bash
pnpm release:benchmark
pnpm release:e2e
pnpm release:load
pnpm release:demo
```

Raw reports are in `benchmarks/results/`; public response examples are in `samples/`; demo recordings are in `artifacts/demo/`.

## Documentation

- [Architecture](docs/ARCHITECTURE.md), [decision records](docs/DECISIONS.md), [trust model](docs/TRUST.md), and [bitemporal model](docs/TEMPORAL.md)
- [Bright Data integration](docs/BRIGHT_DATA.md), [API](docs/API.md), [SDK](docs/SDK.md), and [MCP](docs/MCP.md)
- [Source governance](docs/SOURCE_GOVERNANCE.md), [security](docs/SECURITY.md), [operations](docs/OPERATIONS.md), [recovery](docs/RECOVERY.md), and [limitations](docs/LIMITATIONS.md)
- [Release scope](docs/RELEASE_SCOPE.md), [benchmark](docs/BENCHMARK.md), [demo](docs/DEMO.md), and [release notes](docs/RELEASE_NOTES.md)
- [Hackathon submission pack](docs/HACKATHON_SUBMISSION.md)
- [AI coding-tool disclosure](AI_DISCLOSURE.md) and [third-party dependencies/assets](THIRD_PARTY_NOTICES.md)

The complete twelve-phase product specification and exit-gate record is preserved in [complete_kevlar.md](complete_kevlar.md).
