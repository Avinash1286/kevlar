# Known limitations

- Kevlar does not guarantee perfect truth. It provides deterministic contracts, evidence, conflict handling, and a reviewable release process; source evidence and policy can still be incomplete or wrong.
- The public release benchmark is controlled and fixture-backed. It is a regression proof, not a statistically representative web benchmark.
- The current fleet focuses on AI-infrastructure and the Nova product-price regression. It does not claim broad domain coverage.
- Predicate-specific source authority is configured policy. An official source can still be stale, ambiguous, or authoritative for one field but not another.
- Valid time is preserved when a source states it. Otherwise capture time is evidence of when Kevlar observed a claim, not proof of when that claim became true in the outside world.
- Entity resolution is deterministic where identifiers are strong, but ambiguous and high-risk merges require human review and can remain unresolved.
- Last-known-good service avoids publishing an unverified replacement, but the retained value can become stale; freshness is shown separately from correctness.
- Public-source terms, access behavior, and layouts can change. A source requires a fresh policy/terms review when its scope or collection method materially changes.
- Password authentication is used because the installed `@convex-dev/auth` release does not support WebAuthn/passkeys. Organizations should add their preferred enterprise identity provider before broad production use.
- Bright Data collector creation, self-healing availability, and code approval remain account-scoped Scraper Studio operations. Kevlar can run, inspect, triage, and certify them but cannot bypass provider authorization or guarantee the provider workflow is available.
- Raw evidence retention is bounded. A retained digest can prove that an artifact changed, but cannot reconstruct content after the artifact itself expires.
- The API is REST-first, the SDK is TypeScript-only, and MCP is intentionally read-only. GraphQL and write-capable agent tools are outside v1.0.0.
- Backups are manifest-verified exports. The release proves restoration against a throwaway development target; it does not claim continuous cross-region disaster recovery.
- AI suggestions are fallible and non-authoritative. The AI router consumes only released events and still requires review; it is not an autonomous production configuration controller.
- Vercel serves the web and API surface while the proven Convex data target is a development deployment. A production Convex promotion requires a separate, explicit deployment decision.
