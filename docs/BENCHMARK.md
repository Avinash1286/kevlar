# Kevlar v1.0.1 benchmark

The release benchmark was measured on 2026-08-22 from the committed Nova fixture, deterministic trust packages, and live development proof data. Raw cases, hashes, per-operation timings, and limitations are in [`benchmarks/results/v1.0.1.json`](../benchmarks/results/v1.0.1.json). Production HTTP load output is in [`v1.0.1-load.json`](../benchmarks/results/v1.0.1-load.json), and the full-flow proof is in [`v1.0.1-e2e.json`](../benchmarks/results/v1.0.1-e2e.json).

| Metric                          |                  Measured result |                                               Denominator |
| ------------------------------- | -------------------------------: | --------------------------------------------------------: |
| Silent-corruption catch rate    |                              1/1 |                       one labeled financing/purchase swap |
| Correct triage rate             |                              9/9 |                        nine deterministic failure classes |
| False-heal rate                 |                              0/2 |                                     two negative controls |
| Held-out repair pass rate       |                              2/2 |                             two undisclosed DOM relations |
| Critical false releases         |                                0 |                          eight repair certification cases |
| Semantic-event precision        |                              3/3 | three emitted semantic events; layout-only drift excluded |
| Semantic-event recall           |                              3/3 |      three labeled business changes/corrections/conflicts |
| False-quarantine rate           |                              0/6 |              six valid visible or held-out mutation cases |
| Last-known-good availability    |                              1/1 |                  controlled semantic-swap continuity case |
| Entity-resolution accuracy      |                              3/3 |                exact, ambiguous, and AI-suggestion labels |
| Delivery success                |                              2/2 |                first attempt and dead-letter replay paths |
| Live production request success |                            80/80 |                 10 concurrent requests across eight pages |
| Live production latency         | median 302.80 ms; p95 1193.86 ms |            fresh 80-request batch against the final alias |
| Proof workload cost             |                            $0.01 |                        Phase 11 controlled proof estimate |

Five layered baselines are recorded: schema-only extraction; source semantic contracts; contracts plus an executed canonical mapping with field provenance; full Kevlar without held-out repair cases; and full Kevlar with held-out repair cases plus triage, identity, semantic CDC, delivery, tenant security, operations, and reviewed AI routing. These are distinct measured projections over the same controlled fixtures, not five independently operated production systems.

Limitations: the labeled data set is deliberately small and fixture-backed; percentages must not be represented as general accuracy. Local deterministic latency is separated from production HTTP latency. Cost is one proof workload estimate, not a forecast.
