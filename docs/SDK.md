# TypeScript SDK

`@kevlar/sdk` is locally installable from `packages/sdk`. It uses the public Zod contracts from `@kevlar/api-contracts`, so runtime parsing and TypeScript response types cannot drift independently.

```ts
import { KevlarClient } from "@kevlar/sdk";

const kevlar = new KevlarClient({
  baseUrl: "https://kevlar-web.vercel.app/api",
  apiKey: process.env.KEVLAR_API_KEY!,
});

const current = await kevlar.currentFacts("ENTITY_ID");
const history = await kevlar.historicalFacts("ENTITY_ID", {
  predicate: "product.purchase_price",
});
```

The client sends secrets only through the Authorization header and never logs them.
