# Security model

Kevlar treats collection output as untrusted evidence. Webpage text is delimited inside compact prompts and cannot authorize release, repair, merge, or router changes. High-impact actions require an authenticated organization member with an allowed role and a server-side project ownership check.

Outbound source and webhook URLs must use HTTPS, contain no credentials, resolve outside private/loopback/link-local ranges, and satisfy the project host policy. Redirect targets must be checked again.

API keys and webhook signing secrets are accepted only in transient actions. Only hashes, visible prefixes, and external secret references are persisted. Structured logs and alert payloads pass through recursive redaction.

Tenant-scoped reads resolve the caller's organization membership from the authenticated subject. Client-supplied actor IDs are never trusted. Cross-organization resource IDs return a denial without leaking the other tenant's record.
