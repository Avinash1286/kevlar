# Activate the two Anthropic collectors

The Bright Data API created both stable collectors and generated runnable templates. Bright Data reports them active, but Kevlar rejected their generated output envelopes. Do not treat them as production-quality until the steps below pass.

## Anthropic pricing

1. In Bright Data **My Scrapers**, open `kevlar-anthropic-api-pricing` (`c_mt4e7tgw1i46wxboqa`) and select **Code**.
2. Keep one stage. Replace its **Interaction code** with `anthropic-pricing/interaction.js` and its **Parser code** with `anthropic-pricing/parser.js`.
3. In **Input**, keep exactly one field: `url`, type **String**, **Required**.
4. Use `anthropic-pricing/output-schema.json` as the output contract. If the IDE offers to update the output fields from Preview, accept only when the root keys are `schema_version`, `source_url`, `source_type`, `captured_at`, `provider`, `records`, and `evidence`.
5. Preview with `https://platform.claude.com/docs/en/about-claude/pricing`.
6. Confirm the result contains one envelope, `source_type` is `pricing`, every record has positive input/output USD amounts, and `evidence.content_hash` matches `^sha256:[0-9a-f]{64}$`.
7. Select **Finish editing** / **Save to production**.
8. From `F:\kevlar`, run:

   ```powershell
   pnpm phase5:verify anthropic-pricing c_mt4e7tgw1i46wxboqa
   ```

   Continue only when the final JSON reports one row and `verified: 1`. Copy
   that run's `snapshotId`; do not reuse the rejected snapshot recorded in the
   existing `verification-evidence.json`.

9. Explicitly approve the verified source policy, activate its named
   authorities, certify the collector, and start its production schedule:

   ```powershell
   pnpm phase5:run anthropic-pricing --activate-policy <pricing-verification-snapshot-id>
   ```

   Supplying `--activate-policy` is an operator attestation that the immediately
   preceding verification returned exactly one contract-valid row. The secure
   Convex operation accepts only this committed Anthropic source/collector pair
   and records the verification snapshot in its approval review and audit event.

## Anthropic model catalog

1. In Bright Data **My Scrapers**, open `kevlar-anthropic-model-catalog` (`c_mt4e811ufis8kdvlt`) and select **Code**.
2. Keep one stage. Replace its **Interaction code** with `anthropic-models/interaction.js` and its **Parser code** with `anthropic-models/parser.js`.
3. In **Input**, keep exactly one field: `url`, type **String**, **Required**.
4. Use `anthropic-models/output-schema.json` as the output contract. If the IDE offers to update the output fields from Preview, accept only when the root keys are `schema_version`, `source_url`, `source_type`, `captured_at`, `provider`, `records`, and `evidence`.
5. Preview with `https://platform.claude.com/docs/en/about-claude/models/overview`.
6. Confirm the result contains one envelope, `source_type` is `catalog`, every record has a unique `provider_model_id`, and `evidence.content_hash` matches `^sha256:[0-9a-f]{64}$`.
7. Select **Finish editing** / **Save to production**.
8. From `F:\kevlar`, run:

   ```powershell
   pnpm phase5:verify anthropic-models c_mt4e811ufis8kdvlt
   ```

   Continue only when the final JSON reports one row and `verified: 1`. Copy
   that run's `snapshotId`; do not reuse the rejected snapshot recorded in the
   existing `verification-evidence.json`.

9. Explicitly approve the verified source policy, activate its named
   authorities, certify the collector, and start its production schedule:

   ```powershell
   pnpm phase5:run anthropic-models --activate-policy <models-verification-snapshot-id>
   ```

The run command seeds missing Phase 5 catalog records and resolves internal
collector IDs through an ingest-key-protected Convex mutation. It does not use
or weaken the redacted public `phase5Queries:catalog` response. After a source
policy has been activated, later collection runs omit the attestation flag:

```powershell
pnpm phase5:run anthropic-pricing
pnpm phase5:run anthropic-models
```

Preserve each successful command's source-certification and ingestion IDs.
Until both collectors pass, the strict six-production-collector gate remains
open.
