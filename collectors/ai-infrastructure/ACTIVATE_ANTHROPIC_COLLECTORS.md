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

   Continue only when it reports one row and `verified: 1`.

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

   Continue only when it reports one row and `verified: 1`.

After both verifications pass, seed their source and collector bindings in Convex, run each through `phase5:run`, and preserve the resulting source-certification and ingestion IDs. Until then, the strict six-production-collector gate remains open.
