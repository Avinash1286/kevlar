# Kevlar v1.0.0 benchmark

The release benchmark was measured on 2026-08-22 from the committed Nova fixture, deterministic trust packages, and live development proof data. Raw cases, hashes, per-operation timings, and limitations are in [`benchmarks/results/v1.0.0.json`](../benchmarks/results/v1.0.0.json). Production HTTP load output is in [`v1.0.0-load.json`](../benchmarks/results/v1.0.0-load.json), and the full-flow proof is in [`v1.0.0-e2e.json`](../benchmarks/results/v1.0.0-e2e.json).

| Metric | Measured result | Denominator |
| --- | ---: | ---: |
| Silent-corruption catch rate | 1/1 | one labeled financing/purchase swap |
| Correct triage rate | 9/9 | nine deterministic failure classes |
| False-heal rate | 0/2 | two negative controls |
| Held-out repair pass rate | 2/2 | two undisclosed DOM relations |
| Critical false releases | 0 | eight repair certification cases |
| Semantic-event precision | 3/3 | three emitted semantic events; layout-only drift excluded |
| Entity-resolution accuracy | 3/3 | exact, ambiguous, and AI-suggestion labels |
| Delivery success | 2/2 | first attempt and dead-letter replay paths |
| Live production request success | 80/80 | 10 concurrent requests across eight pages |
| Live production latency | 305.91 ms median, 1202.62 ms p95 | the committed 80-request batch |
| Proof workload cost | $0.01 | Phase 11 controlled proof estimate |

Four baselines are recorded: schema-only, contract-only, Kevlar Core, and the full platform. Schema-only accepts the structurally valid semantic swap and lacks page-state policy. Contract-only blocks the swap. Core additionally certifies generalized repair. The full platform adds triage, identity, semantic CDC, delivery, tenant security, operations, and reviewed AI routing.

Limitations: the labeled data set is deliberately small and fixture-backed; percentages must not be represented as general accuracy. Local deterministic latency is separated from production HTTP latency. Cost is one proof workload estimate, not a forecast.
