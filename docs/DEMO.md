# Demo rehearsal

The release includes two reproducible, silent walkthrough recordings generated from the production deployment:

- `artifacts/demo/kevlar-core-v1.0.0.webm` covers the trust kernel, Gauntlet, repair queue, verified feed, and evidence.
- `artifacts/demo/kevlar-full-platform-v1.0.0.webm` covers sources, entities, bitemporal history, semantic events, conflicts, developer delivery, the verified-event router, operations, and security.

Regenerate both with `pnpm release:demo`. The browser script visits only public production routes and does not contain credentials.

For a narrated recording, use the detailed 3½-minute core and 5–7-minute full-platform scripts in `complete_kevlar.md`. Display only the committed values in `benchmarks/results/v1.0.0.json` and `benchmarks/results/v1.0.0-load.json`; do not extrapolate them beyond the controlled fixture and the measured production request batch.
