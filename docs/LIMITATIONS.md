# Known limitations

- The public release benchmark is controlled and fixture-backed. It is a regression proof, not a statistically representative web benchmark.
- The current fleet focuses on AI-infrastructure and the Nova product-price regression. It does not claim broad domain coverage.
- Password authentication is used because the installed `@convex-dev/auth` release does not support WebAuthn/passkeys. Organizations should add their preferred enterprise identity provider before broad production use.
- Bright Data collector creation and code approval remain account-scoped Scraper Studio operations. Kevlar can run, inspect, triage, and certify them but cannot bypass provider authorization.
- Raw evidence retention is bounded. A retained digest can prove that an artifact changed, but cannot reconstruct content after the artifact itself expires.
- The API is REST-first, the SDK is TypeScript-only, and MCP is intentionally read-only. GraphQL and write-capable agent tools are outside v1.0.0.
- Backups are manifest-verified exports. The release proves restoration against a throwaway development target; it does not claim continuous cross-region disaster recovery.
- The AI router consumes only released events and still requires review. It is not an autonomous production configuration controller.
- Vercel serves the web and API surface while the proven Convex data target is a development deployment. A production Convex promotion requires a separate, explicit deployment decision.
