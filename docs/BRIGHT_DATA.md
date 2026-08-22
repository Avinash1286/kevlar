# Bright Data integration

Kevlar's Core acquisition path uses a custom Scraper Studio Browser worker. The collector owns navigation, interaction, parsing, structured output, response/script tagging, and screenshot capture.

The governed source inventory, Collector IDs, host/path boundaries, cadences, predicate authority, and activation status are maintained in [source governance](SOURCE_GOVERNANCE.md). A recorded ID proves the custom collector identity; preview, production activation, and repair certification are separate evidence.

The runtime adapter uses the current Scraper Studio collection API:

1. `POST /dca/trigger?collector=<c_*>&queue_next=1` returns `collection_id`.
2. Kevlar treats that value as the snapshot ID.
3. `GET /dca/dataset?id=<snapshot>` returns a status object while building and a JSON array when ready.

Every returned row remains untrusted. Week 1 persists it with evidence references; later gates decide whether any field is verified or releasable.

Creation, preview, code inspection, Browser-worker selection, and production save happen in the Scraper Studio IDE. The repository must retain the stable `c_*` ID and redacted creation evidence after account setup.

## Collector repository contract

Each collector directory retains its input and output schemas, source policy or fixture boundary, README, and stable ID once created. The Nova Browser worker additionally retains its interaction and parser source plus a sanitized raw sample. AI-infrastructure collectors share the `ai-infrastructure.source.v1` envelope and are constrained by the pricing, catalog, or changelog contract in their output schema.

The current register includes pricing, catalog, and changelog archetypes. A collector may be active in Bright Data while still pending Kevlar certification. It does not enter Kevlar's production fleet until its generated template is inspected, preview output matches the committed schema, the custom worker is saved, and the human source/terms review is recorded.

Collector rows retain visible contexts and content hashes; schemas permit a screenshot reference where applicable. The Nova proof also tags public JSON-LD and the controlled public product API response as independent extraction evidence. Evidence supports the Tribunal but does not approve release by itself.

Mutation and repair history is certificate-specific. The controlled Nova workflow carries the visible, held-out, and negative-control repair proof. No same-ID heal or certificate is claimed for another source unless its committed or provider-side evidence identifies that exact collector and run.

## Self-healing and approval

Kevlar uses Bright Data's documented asynchronous AI Flow without assuming an unpublished replay API:

1. `POST /dca/collectors/{collector_id}/refactor_template` starts a repair with a prompt of at most 1,000 characters and controlled inputs.
2. `GET /dca/collectors/{collector_id}/refactor_template/progress` is polled with bounded backoff.
3. A `pending_answer` result is the human-review boundary. Kevlar persists the official result and runs its pre-approval Tribunal.
4. `POST /dca/collectors/{collector_id}/resume_automation_job` sends an explicit Boolean approval or rejection. Approved jobs use `auto_save` only after the decision is audited.
5. The same collector ID is triggered again for the failing URL, four visible mutations, and two held-out mutations. N1 and N2 are evaluated as no-heal controls.

Bright Data proposes and applies the repair. Kevlar continues serving last-known-good data and blocks promotion until every critical post-approval certification check passes.

Official references: [AI Flow overview](https://docs.brightdata.com/api-reference/scraper-studio-api/ai-flow/overview), [trigger self-healing](https://docs.brightdata.com/api-reference/scraper-studio-api/ai-flow/trigger-self-healing), [progress](https://docs.brightdata.com/api-reference/scraper-studio-api/ai-flow/self-healing-job-progress), and [approve or reject](https://docs.brightdata.com/api-reference/scraper-studio-api/ai-flow/resume-self-healing-job).
