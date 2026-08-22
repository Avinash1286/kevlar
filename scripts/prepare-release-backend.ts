import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const publishCore = makeFunctionReference<
  "mutation",
  { ingestKey: string; published: boolean; operationKey: string },
  {
    _id: string;
    slug: string;
    publicReadStatus?: "private" | "published";
  }
>("phase11Access:setKevlarCorePublicRead");

const seedSourceCatalog = makeFunctionReference<
  "mutation",
  { ingestKey: string; regressionCollectorPlatformId?: string },
  { domainPackId: string; sourceIds: string[]; regressionBound: boolean }
>("phase5Catalog:seedCatalog");

async function main() {
  const convexUrl =
    process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  const ingestKey = process.env.KEVLAR_BASELINE_INGEST_KEY;
  if (!convexUrl || !ingestKey) {
    throw new Error("CONVEX_URL and KEVLAR_BASELINE_INGEST_KEY are required");
  }

  const convex = new ConvexHttpClient(convexUrl);
  const project = await convex.mutation(publishCore, {
    ingestKey,
    published: true,
    operationKey: "release:v1.0.1:publish-kevlar-core",
  });

  if (
    project.slug !== "kevlar-core" ||
    project.publicReadStatus !== "published"
  ) {
    throw new Error("Kevlar Core was not published for public read access");
  }
  const catalog = await convex.mutation(seedSourceCatalog, { ingestKey });

  console.log(
    JSON.stringify({
      projectId: project._id,
      projectSlug: project.slug,
      publicReadStatus: project.publicReadStatus,
      domainPackId: catalog.domainPackId,
      sourceCount: catalog.sourceIds.length,
      regressionBound: catalog.regressionBound,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
