# Anthropic model catalog collector

Governed custom Scraper Studio collector definition for Anthropic's official model overview. It extracts stable Claude API model IDs, lifecycle, modalities, token limits, and capabilities supported by direct page evidence.

The repository stores a labelled contract fixture, not live-run evidence. `collector-id.txt` records the stable ID returned by Scraper Studio; `creation-evidence.json` explicitly preserves that the initial stub was inactive. Production activation must not be claimed until the generated parser passes preview, the collector is saved to production, and a real run passes Kevlar Core.

## Current lifecycle

- Bright Data collector: `c_mt4e811ufis8kdvlt`
- Bright Data reports it active and records a completed run.
- Kevlar Core rejected that run because AI Flow generated a flat single-model row rather than the governed envelope.
- The proposed self-heal did not correct the preview and was explicitly rejected.

`interaction.js` and `parser.js` are the reviewed replacement code. Paste them into the matching Scraper Studio editors, configure the repository input/output schemas, run Preview, and save only after `pnpm phase5:verify anthropic-models c_mt4e811ufis8kdvlt` reports `verified: 1`.
