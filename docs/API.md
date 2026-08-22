# Kevlar REST API v1

Kevlar exposes released intelligence at `/api/v1`. Send `Authorization: Bearer kv_live_...` on every request. Keys are scope-bound; only their SHA-256 hash and visible prefix are stored.

Read endpoints include entities, current facts, bitemporal history, released events, evidence, certificates, conflicts, and source health. Lists use opaque cursors with a maximum page size of 50. Every response includes a request ID and rate-limit headers.

Facts always include their release state, freshness, supporting sources, evidence references, and certificate reference. Quarantined candidates are not exposed as current facts.

Errors use `{ "error": { "code", "message", "request_id", "details" } }`.

## Authentication example

```sh
curl "https://kevlar-web.vercel.app/api/v1/facts?entity_id=ENTITY_ID" \
  -H "Authorization: Bearer $KEVLAR_API_KEY"
```

Never place a Kevlar API key in browser code or commit it to source control.
