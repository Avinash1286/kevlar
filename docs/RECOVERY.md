# Backup, restore, retention, and deletion

Kevlar backup manifests contain a content digest, source deployment, schema revision, table counts, creation time, storage reference, and retention policy. Secret values are excluded; deployments must restore those from their secret manager.

## Restore drill

1. Create a throwaway Convex development deployment. Never rehearse into production.
2. Restore the newest export referenced by an immutable manifest.
3. Run the manifest verification API and compare every table count and digest.
4. Query the Repair Certificate, released fact history, semantic events, source catalog, and tenant membership.
5. Run `pnpm release:e2e` against the throwaway deployment.
6. Record the verification result and delete the throwaway deployment only after the report is saved.

Project deletion is owner/admin-only, idempotent, and bounded. It tombstones the project, disables service access, redacts raw evidence and row payloads in batches, and retains only hashes, certificates/events required for audit, security decisions, and the deletion tombstone. Retention runs use configured policy windows and leave a count/digest audit record.

The v1.0.0 release proof validates a manifest against the development deployment and executes deletion only against a disposable project.
