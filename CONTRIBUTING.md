# Contributing

Kevlar changes are evaluated against the documented release scope, trust model, and committed regression evidence.

1. Create a short-lived branch from `main`.
2. Keep pure trust logic in `packages/*` and provider/database boundaries in adapters.
3. Add tests with behavior changes.
4. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
5. Never include credentials, fabricated benchmark results, or unsupported trust claims.

Repairs and facts are both untrusted until deterministic verification and the applicable approval gate pass.
