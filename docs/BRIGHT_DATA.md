# Bright Data integration

Kevlar's Core acquisition path uses a custom Scraper Studio Browser worker. The collector owns navigation, interaction, parsing, structured output, response/script tagging, and screenshot capture.

The runtime adapter uses the current Scraper Studio collection API:

1. `POST /dca/trigger?collector=<c_*>&queue_next=1` returns `collection_id`.
2. Kevlar treats that value as the snapshot ID.
3. `GET /dca/dataset?id=<snapshot>` returns a status object while building and a JSON array when ready.

Every returned row remains untrusted. Week 1 persists it with evidence references; later gates decide whether any field is verified or releasable.

Creation, preview, code inspection, Browser-worker selection, and production save happen in the Scraper Studio IDE. The repository must retain the stable `c_*` ID and redacted creation evidence after account setup.

## Self-healing and approval

Kevlar uses Bright Data's documented asynchronous AI Flow without assuming an unpublished replay API:

1. `POST /dca/collectors/{collector_id}/refactor_template` starts a repair with a prompt of at most 1,000 characters and controlled inputs.
2. `GET /dca/collectors/{collector_id}/refactor_template/progress` is polled with bounded backoff.
3. A `pending_answer` result is the human-review boundary. Kevlar persists the official result and runs its pre-approval Tribunal.
4. `POST /dca/collectors/{collector_id}/resume_automation_job` sends an explicit Boolean approval or rejection. Approved jobs use `auto_save` only after the decision is audited.
5. The same collector ID is triggered again for the failing URL, four visible mutations, and two held-out mutations. N1 and N2 are evaluated as no-heal controls.

Bright Data proposes and applies the repair. Kevlar continues serving last-known-good data and blocks promotion until every critical post-approval certification check passes.

Official references: [AI Flow overview](https://docs.brightdata.com/api-reference/scraper-studio-api/ai-flow/overview), [trigger self-healing](https://docs.brightdata.com/api-reference/scraper-studio-api/ai-flow/trigger-self-healing), [progress](https://docs.brightdata.com/api-reference/scraper-studio-api/ai-flow/self-healing-job-progress), and [approve or reject](https://docs.brightdata.com/api-reference/scraper-studio-api/ai-flow/resume-self-healing-job).
