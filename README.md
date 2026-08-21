# Kevlar

**The changing web, verified before it reaches your systems.**

Kevlar is a repair-certification firewall and verified live-web intelligence platform. Bright Data custom collectors acquire and self-heal public web sources; Kevlar treats every result and repair as untrusted until deterministic contracts, independent evidence, human approval where required, and held-out tests support release.

## Current phase

Week 1 is in progress: monorepo foundation, the public Nova V1 fixture, initial Convex schema, custom collector assets, and typed Bright Data runtime boundaries. Live Convex, Vercel, and Bright Data proof requires the account setup documented in [docs/SETUP.md](docs/SETUP.md).

## Local development

Requirements: Node.js 22+ and pnpm 10.33+.

```bash
pnpm install
pnpm dev:web
pnpm dev:fixture
```

- Operator web app: `http://localhost:3000`
- Fixture lab: `http://localhost:3001/product-pricing/nova`
- Public fixture evidence API: `http://localhost:3001/api/public-product/nova`

Copy `.env.example` to `.env.local` only when connecting hosted services. Never commit that file.

## Quality gate

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The complete product and twelve-phase implementation specification is preserved in [complete_kevlar.md](complete_kevlar.md).
