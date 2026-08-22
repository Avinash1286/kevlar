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

## Application release rollback

Release tag `v1.0.0` is the immutable code rollback point. Rolling back the web
application re-points the Vercel production alias to a previously built artifact;
it does not rewrite Convex data or Git history.

1. Stop promotions and record the incident, current production deployment URL,
   commit, and operator.
2. Run `vercel ls` and `vercel inspect <known-good-deployment-url>` from
   `apps/web`. Confirm that the candidate is `READY`, belongs to the Kevlar web
   project, and corresponds to tag `v1.0.0` or another explicitly approved
   release.
3. Run `vercel rollback <known-good-deployment-url>`. The equivalent dashboard
   action is **Deployments → known-good deployment → Promote to Production**.
   Do not rebuild the old source: promote the already-tested artifact.
4. Verify `/`, `/release`, `/feed`, `/history`, `/events`, `/evidence`,
   `/developers`, and `/security`, then run `pnpm release:e2e` with
   `KEVLAR_PUBLIC_URL` set to the production alias.
5. Inspect Vercel error logs for the rolled-back deployment and record the
   deployment URL, verification result, and rollback reason in the incident.

The v1.0.0 Convex proof targets only `dev:veracious-eagle-977`; no production
Convex deployment is part of this release. Do not attempt a destructive schema
rollback. If the development backend must be reconstructed, create a fresh
development/preview deployment from tag `v1.0.0`, restore the newest verified
manifest into that isolated target, run the restore checks above, and switch the
web environment only after explicit target confirmation and a passing preview.
