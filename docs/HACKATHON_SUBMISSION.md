# Hackathon submission pack

This file contains copy-ready material for the Into the Scrape-Verse submission form. It does **not** record or imply that the form has been submitted.

## Manual form fields

- Email: **[MANUAL — submitter email]**
- Team name: **[MANUAL — team name, or `SOLO` if submitting alone]**
- Submitter name: **[MANUAL — full name]**
- Track selection: **[MANUAL — select the intended track or tracks]**
- YouTube demo URL: **[MANUAL — public or unlisted YouTube URL, maximum three minutes]**

## Public links

- Repository: <https://github.com/Avinash1286/kevlar>
- Production application: <https://kevlar-web.vercel.app>
- Public release: <https://github.com/Avinash1286/kevlar/releases/tag/v1.0.1>

## Project description

Kevlar is a verification firewall for live-web intelligence. Custom Bright Data Scraper Studio collectors acquire public pricing, catalog, and changelog data, but a successful scrape is never treated as truth automatically. Kevlar preserves the raw observation and evidence, applies a versioned deterministic mapping, resolves canonical identity, reconciles predicate-specific source authority, and releases an append-only bitemporal fact only after its policy gates pass.

When a collector silently swaps meaning or a source changes shape, Kevlar quarantines the suspect result and continues serving an explicitly labelled last-known-good value. Bright Data can propose a repair, while Kevlar requires evidence, human approval for high-impact decisions, visible and held-out mutation tests, negative controls, and a digest-bound Repair Certificate before release. Verified facts and semantic events are then available through REST, signed webhooks, a TypeScript SDK, read-only MCP, and a reviewed AI-router consumer.

The v1.0.1 controlled benchmark passed 24/24 labelled checks with zero false releases. These are fixture-backed regression results, not population-level accuracy claims.

## Stack and architecture

- Next.js 16 and React 19 for the operator and developer interfaces.
- Vercel for the public web and API deployment.
- Convex for the reactive backend, append-only fact history, workflows, authorization, delivery, operations, and audit records.
- Bright Data Scraper Studio custom collectors for central acquisition, structured extraction, evidence tagging, and repair proposals.
- TypeScript, Zod, and deterministic pure packages for contracts, mapping, hashing, triage, identity, temporal facts, semantic CDC, and certification.
- REST, HMAC-signed webhooks, a TypeScript SDK, and read-only MCP for downstream delivery.

```text
public source -> Bright Data custom collector -> untrusted row + evidence
              -> deterministic mapping + identity + release policy
              -> bitemporal fact -> semantic event -> API/webhook/SDK/MCP

failure -> quarantine + last-known-good -> repair proposal
        -> human review -> Gauntlet -> certificate -> release or rejection
```

## How Scraper Studio is central

Kevlar does not use a prebuilt Scrapers Library collector in its core path. Scraper Studio custom collectors own navigation, interaction, parsing, typed output, and page/API/script/screenshot evidence. Kevlar triggers a `c_*` collector through the Bright Data collection API, stores the returned snapshot reference, and ingests the resulting structured rows as untrusted observations. Removing Scraper Studio would remove both acquisition and the provider repair-proposal workflow, not merely an optional enrichment.

The release's fully rehearsed path is the Nova product-pricing collector, `c_mt3utzwt29hbznvax9`. It distinguishes the `$129` one-time purchase price from the `$10.75/month` financing value and retains visible text, public JSON-LD, a controlled public product API response, and a screenshot reference. A deliberately schema-valid semantic swap demonstrates why schema validation alone is insufficient.

The repository records these additional real custom collector IDs:

| Source                  | Collector ID           | Evidence-qualified state                                                                                                                           |
| ----------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI API pricing      | `c_mt460ht33qmbg7m8k`  | Governed ID and schema recorded                                                                                                                    |
| OpenAI model catalog    | `c_mt44w77a1irbn8ooh`  | Governed ID and schema recorded                                                                                                                    |
| Anthropic release notes | `c_mt43rdlsyxpwuqofn`  | Governed ID and schema recorded                                                                                                                    |
| Anthropic API pricing   | `c_mt4e7tgw1i46wxboqa` | Bright Data active with a completed run; Kevlar rejected the snapshot as `schema_invalid`, so it is not Kevlar-certified or production-quality yet |
| Anthropic model catalog | `c_mt4e811ufis8kdvlt`  | Bright Data active with a completed run; Kevlar rejected the snapshot as `schema_invalid`, so it is not Kevlar-certified or production-quality yet |

For the two new Anthropic collectors, the generated self-heal previews did not satisfy the committed output contract and were explicitly rejected. Reviewed interaction/parser replacements are source-controlled, but they still require account-bound preview, save, a new run, and a passing Kevlar Core verification. This distinction demonstrates Kevlar's central claim: provider activation is not the same as verified production release.

## Demo video plan

Upload-ready recording: `artifacts/demo/kevlar-hackathon-submission-v1.0.1.mp4`

- Measured duration: **45.44 seconds**
- Resolution: **1440 × 900**
- Route order: home, sources, entities, history, events, conflicts, developers, router, operations, security
- Upload requirement: upload this already narrated and captioned MP4 to YouTube as public or unlisted, and verify the link while signed out.

### Narration matched to the recording

| Time           | Screen     | Narration                                                                                              |
| -------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| 00:00–00:04    | Home       | “Kevlar verifies changing web data before it reaches production systems.”                              |
| 00:04–00:08    | Sources    | “Custom Bright Data collectors acquire governed public pricing, catalog, and changelog sources.”       |
| 00:08–00:12    | Entities   | “Deterministic mappings resolve observations into canonical entities with field-level provenance.”     |
| 00:12–00:16    | History    | “The Convex backend preserves append-only bitemporal history, corrections, and last-known-good facts.” |
| 00:16–00:20    | Events     | “Only verified fact changes become semantic events.”                                                   |
| 00:20–00:24    | Conflicts  | “Disagreement opens an explicit conflict instead of silently averaging values.”                        |
| 00:24–00:29    | Developers | “Next.js on Vercel exposes REST, signed webhooks, a TypeScript SDK, and read-only MCP.”                |
| 00:29–00:33    | Router     | “AI sees only released events and proposes changes; it never approves them.”                           |
| 00:33–00:38    | Operations | “Operations track freshness, delivery, provider health, costs, backups, and alerts.”                   |
| 00:38–00:45.44 | Security   | “Our controlled benchmark passed twenty-four of twenty-four checks with zero false releases.”          |

Speak at approximately 145–150 words per minute. Do not replace “controlled benchmark” with a general accuracy claim.

## Developer-experience feedback draft

### Bright Data CLI rating

**[MANUAL RATING — 1 to 5]**

### Ease of getting the first scrape working

**[MANUAL RATING — 1 to 5]**

### Most frustrating issue

The hardest part was keeping generated Scraper Studio templates aligned with an exact output contract. Two new active collectors completed Bright Data runs, but one returned a different pricing wrapper with a truncated checksum and the other returned a flat single-model row. Both failed Kevlar's committed schema. AI self-heal completed, but its previews retained the incompatible shapes, so we rejected both rather than claiming production readiness. A schema-aware preview diff and a “block activation when output does not validate” option would make this much safer and faster.

### Where we were stuck longest and what unblocked us

The first Nova preview exposed several IDE-specific validation details: the required `url` input had to be declared explicitly, an idle-timeout value had to be numeric or omitted, and the screenshot filename validator rejected a hyphenated name. The run log was ultimately the source of truth. Defining `url` as a required string, using the supported idle call, changing the filename to `nova_page`, and rerunning Preview produced the structured row with JSON-LD, public-API, and screenshot evidence.

### Overall developer experience and suggestions

Scraper Studio is powerful once the interaction/parser contract is stable: it can combine browser state, visible context, scripts, network responses, and screenshots into one governed structured result. The trigger/dataset APIs and explicit self-heal approval boundary also fit an auditable workflow well.

The largest improvements would be source-controlled import/export for interaction code, parser code, and schemas as one versioned bundle; automatic JSON Schema validation before save or activation; a field-by-field diff for AI-generated and self-heal previews; persistent named preview inputs; clearer validation messages with accepted examples; and separate status labels for “Bright Data active,” “last run completed,” and “last run passed the declared contract.”

## Final manual attestations

- **[MANUAL ATTESTATION — confirm team size is 1–4 and every member belongs to only one team]**
- **[MANUAL ATTESTATION — confirm the main implementation began after kickoff]**
- **[MANUAL ATTESTATION — confirm the fixture content is owned/created by the team]**
- **[MANUAL ATTESTATION — assign the named human source owner and confirm applicable source-terms review]**
- **[MANUAL ATTESTATION — confirm every submitted subsystem can be explained by the team]**
- **[MANUAL ATTESTATION — confirm internal ownership and respectful-conduct requirements]**
- **[MANUAL — upload the narrated demo and replace the YouTube placeholder]**
- **[MANUAL — review every answer, enter ratings, and submit the official form before its deadline]**

Optional LinkedIn information can be left blank if the form permits it. Do not claim the two new Anthropic collectors as Kevlar-certified until a replacement preview and real run pass the committed contract.
