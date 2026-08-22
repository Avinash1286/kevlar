import { KevlarClient } from "../packages/sdk/src/index";

const apiKey = process.env.KEVLAR_API_KEY;
if (!apiKey) throw new Error("Set KEVLAR_API_KEY before running this example.");

const kevlar = new KevlarClient({
  baseUrl: process.env.KEVLAR_API_URL ?? "https://kevlar-web.vercel.app/api",
  apiKey,
});

const page = await kevlar.currentFacts(process.argv[2] ?? "qs79dceshc71enmf9q6pr6r1q18cyeqb");
for (const fact of page.data) {
  console.log(fact.predicate, fact.value, fact.trust.state, fact.trust.evidence_refs);
}
