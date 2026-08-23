# Release notes

## v1.0.1 — 2026-08-22

This patch release hardens every public Convex read boundary, adds explicit
project publication, redacts private source/tenant/delivery fields, registers
the two provider-active Anthropic collectors as pending rather than certified,
repairs the secure post-verification fleet automation, and refreshes the public
submission and rollback package.

Release evidence:

- 133 unit/integration/security tests across 24 files;
- five measured benchmark baselines and 24/24 labeled checks with zero false
  releases;
- explicit 3/3 semantic-event precision and 3/3 recall;
- 7/7 live full-flow assertions across 18/18 production pages;
- 80/80 successful production load requests;
- a narrated, captioned, 1440x900 H.264/AAC demo under three minutes;
- Vercel production deployment `dpl_8vNdRudfWrnmNDf8eau5GGSpZCYc` at
  <https://kevlar-web.vercel.app> and the
  explicitly published `kevlar-core` project on Convex development deployment
  `veracious-eagle-977`.

Recovery boundary: a fresh Convex snapshot export and same-project manifest
verification succeeded. An import/query drill in a different throwaway
deployment remains open because the account has no Preview Deploy Key and the
preview path is billing-gated; v1.0.1 does not claim proven restoration.

## v1.0.0 — 2026-08-22

Kevlar's first complete public platform release includes the repair-certification trust kernel, canonical multi-source intelligence, bitemporal history, semantic events, evidence bundles, fleet certification, REST/webhook/SDK/MCP delivery, operator authentication and tenant RBAC, operations and recovery controls, and a reviewed verified-event AI-router consumer.

Release evidence:

- 113 unit/integration/security tests after Phase 12 additions;
- four measured baselines and 24 labeled benchmark checks;
- zero false releases in the controlled benchmark;
- 7/7 live full-flow assertions and 12/12 production pages;
- 80/80 production load requests successful;
- credential scan, authorization adversarial tests, chaos proof, and documented restore drill passed.

Deployment: <https://kevlar-web.vercel.app>. See [limitations](LIMITATIONS.md) before using benchmark values or promoting the Convex backend beyond its proven development deployment.
