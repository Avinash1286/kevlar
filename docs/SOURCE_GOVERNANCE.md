# Source governance

This register describes the sources Kevlar is permitted to collect, their narrow authority, and the evidence required to operate them. A `c_*` identifier means a custom Bright Data Scraper Studio collector has been created; it does not by itself prove preview approval or production activation.

## Release controls

- Collect only public, non-login, non-paywalled product or documentation content described below.
- Construct inputs only from HTTPS URLs that match the exact approved host and path prefix.
- Treat every collector row as untrusted until it passes the domain contract and release policy.
- Apply source authority per predicate; official ownership of a page is not universal authority for every field.
- Respect the committed cadence, concurrency, and daily quota. A schedule increase requires human review.
- Store direct contexts and content hashes, plus screenshots only where the output contract permits them.
- Configure evidence duration through the project's retention policy. A source record does not grant indefinite retention.
- Record a human owner and terms review before changing a pending collector to production-active.

The source JSON files and `tests/unit/phase5-source-catalog.test.ts` enforce the AI-infrastructure host, path, public-data, archetype, and authority declarations. `packages/security/src/index.ts` provides the shared public-URL guard used by controlled outbound integrations.

## Source register

Technical metadata was reviewed against the repository on 2026-08-22. This is an engineering review, not legal advice or a substitute for the submitter's final source-terms sign-off.

| Source                    | Purpose                                                                                  | Approved URL boundary                                        | Type and cadence                                                            | Collector state                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `openai-pricing`          | Observe official API price, currency, and billing-unit statements                        | `https://openai.com/api/pricing/`                            | Pricing; every 360 minutes; max 1 concurrent; quota 12/day                  | Custom ID `c_mt460ht33qmbg7m8k` recorded                                   |
| `openai-models`           | Observe official model identity, capability, endpoint, and limit statements              | `https://platform.openai.com/docs/models`                    | Catalog; every 720 minutes; max 1 concurrent; quota 8/day                   | Custom ID `c_mt44w77a1irbn8ooh` recorded                                   |
| `anthropic-release-notes` | Observe official capability, deprecation-status, and effective-date statements           | `https://docs.anthropic.com/en/release-notes/`               | Changelog; every 360 minutes; max 1 concurrent; quota 12/day                | Custom ID `c_mt43rdlsyxpwuqofn` recorded                                   |
| `anthropic-pricing`       | Observe official API price, currency, and billing-unit statements                        | `https://platform.claude.com/docs/en/about-claude/pricing`   | Pricing; every 360 minutes; max 1 concurrent; quota 12/day                  | Bright Data active as `c_mt4e7tgw1i46wxboqa`; Kevlar certification pending |
| `anthropic-models`        | Observe official model identity, capability, endpoint, and limit statements              | `https://platform.claude.com/docs/en/about-claude/models/`   | Catalog; every 720 minutes; max 1 concurrent; quota 8/day                   | Bright Data active as `c_mt4e811ufis8kdvlt`; Kevlar certification pending  |
| `nova-product-pricing`    | Exercise the controlled purchase-price semantic-regression and repair-certification path | `https://kevlar-fixture-lab.vercel.app/product-pricing/nova` | Controlled product-pricing fixture; initiated for proof and regression runs | Custom ID `c_mt3utzwt29hbznvax9` recorded and run evidence committed       |

The operating owner role is **Kevlar source maintainer**. The hackathon submitter must record the responsible person's name and confirm applicable source terms before promoting either pending Anthropic collector into Kevlar's certified production fleet or materially changing any source policy.

## Fields and evidence

The three AI-infrastructure archetypes use versioned JSON Schema:

- pricing: provider identity, typed price records, capture time, source URL, page heading, contexts, optional screenshot reference, and a SHA-256 content digest;
- catalog: provider/model identity, lifecycle and capabilities represented by the canonical contract, capture time, source URL, page heading, contexts, optional screenshot reference, and a SHA-256 content digest;
- changelog: dated launch/update/migration/deprecation/retirement observations, affected models and summary represented by the canonical contract, plus the same capture and evidence envelope.

The Nova schema retains product identity, one-time purchase price, monthly payment, availability, independent JSON-LD and public-API price observations, visible purchase context, and screenshot reference. The schemas beside each collector are the authoritative field inventories.

Evidence content is provenance, not release authority. A source can support only the predicates listed in its `predicate_authority` declaration. OpenAI and Anthropic pricing pages do not establish lifecycle status; catalog pages do not establish unrelated pricing; release notes do not establish arbitrary catalog or billing facts. Nova is a controlled fixture and is never represented as independent market evidence.

## Review and activation

Before production activation, the assigned human owner must record:

1. successful public access without account credentials;
2. confirmation that no personal or restricted data is required;
3. review of source usage and applicable terms;
4. matching host/path policy and schema;
5. a successful preview with redacted evidence;
6. the stable custom Collector ID and approved version;
7. an appropriate retention policy;
8. reviewer name and review date.

An absent item keeps the source in draft, pending, or paused state. Repository metadata must not be used to imply provider approval.

## Retirement process

Retiring a source requires an audited operation:

1. pause its schedule and collector binding so no new collection starts;
2. mark the source retired and record owner, reason, and effective time;
3. preserve append-only observations, released fact versions, events, certificates, and integrity digests under policy;
4. label current facts stale or superseded according to release policy—absence alone does not remove a fact;
5. revoke source-specific credentials or external secret references when no longer needed;
6. apply bounded evidence retention/redaction without rewriting historical decisions;
7. update this register and downstream source-health documentation.

Project-level deletion remains a separate authenticated workflow described in [recovery and deletion](RECOVERY.md).
