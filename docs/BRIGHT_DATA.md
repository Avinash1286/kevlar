# Bright Data integration

Kevlar's Core acquisition path uses a custom Scraper Studio Browser worker. The collector owns navigation, interaction, parsing, structured output, response/script tagging, and screenshot capture.

The runtime adapter uses the current Scraper Studio collection API:

1. `POST /dca/trigger?collector=<c_*>&queue_next=1` returns `collection_id`.
2. Kevlar treats that value as the snapshot ID.
3. `GET /dca/dataset?id=<snapshot>` returns a status object while building and a JSON array when ready.

Every returned row remains untrusted. Week 1 persists it with evidence references; later gates decide whether any field is verified or releasable.

Creation, preview, code inspection, Browser-worker selection, and production save happen in the Scraper Studio IDE. The repository must retain the stable `c_*` ID and redacted creation evidence after account setup.
