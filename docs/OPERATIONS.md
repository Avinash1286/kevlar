# Operations

Phase 11 records structured operational signals for provider failure, Bright Data pending jobs, duplicate events, source outage, webhook failure, and freshness breach. Critical signals open a deduplicated alert linked to a runbook.

Backups and exports are represented by immutable manifests with a content digest, table counts, creation time, and retention policy. Restore drills must target a throwaway development deployment and verify referential counts before any production recovery.

The v1.0.1 recovery procedure and deletion boundary are documented in [RECOVERY.md](RECOVERY.md). Project deletion is an authenticated owner/admin operation, runs in bounded idempotent batches, redacts raw payloads, and leaves an auditable tombstone.

The operator console shows freshness compliance, source health, delivery health, provider circuits, cost units, active alerts, and latest backup/export status. Secret-bearing fields are never included in dashboard payloads.

Release monitoring uses Vercel deployment status and error logs plus Convex structured signals. The committed chaos proof covers provider failure, Bright Data pending, duplicate events, source outage, and webhook failure; each critical case opens the linked runbook alert.
