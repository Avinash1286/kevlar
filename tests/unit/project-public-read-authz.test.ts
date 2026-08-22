/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");
const now = 1_787_400_000;
const ingestKey = "test-project-publication-ingest-key";

beforeEach(() => {
  vi.stubEnv("KEVLAR_BASELINE_INGEST_KEY", ingestKey);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function tenantReadFixture() {
  const t = convexTest(schema, modules);
  const providerUsers = await t.run(async (ctx) => ({
    owner: await ctx.db.insert("users", {
      name: "Owner",
      email: "owner@example.test",
    }),
    foreign: await ctx.db.insert("users", {
      name: "Foreign",
      email: "foreign@example.test",
    }),
  }));
  const owner = t.withIdentity({
    subject: String(providerUsers.owner),
    issuer: "https://auth.test",
    tokenIdentifier: `https://auth.test|${providerUsers.owner}`,
    email: "owner@example.test",
  });
  const foreign = t.withIdentity({
    subject: String(providerUsers.foreign),
    issuer: "https://auth.test",
    tokenIdentifier: `https://auth.test|${providerUsers.foreign}`,
    email: "foreign@example.test",
  });
  const ownerUser = await owner.mutation(api.phase11Access.syncCurrentUser, {});
  const foreignUser = await foreign.mutation(
    api.phase11Access.syncCurrentUser,
    {},
  );

  const ids = await t.run(async (ctx) => {
    const primaryOrganizationId = await ctx.db.insert("organizations", {
      slug: "primary-public-read",
      name: "Primary public read",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const foreignOrganizationId = await ctx.db.insert("organizations", {
      slug: "foreign-public-read",
      name: "Foreign public read",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: primaryOrganizationId,
      userId: ownerUser._id,
      role: "owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: foreignOrganizationId,
      userId: foreignUser._id,
      role: "owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const domainPackId = await ctx.db.insert("domainPacks", {
      key: "public-read-test",
      name: "Public read test",
      version: "1.0.0",
      status: "active",
      coreRequired: true,
      createdAt: now,
      updatedAt: now,
    });

    const createProject = async (
      slug: string,
      publicReadStatus?: "private" | "published",
    ) => {
      const projectId = await ctx.db.insert("projects", {
        name: slug,
        slug,
        status: "active",
        publicReadStatus,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("projectTenancies", {
        projectId,
        organizationId: primaryOrganizationId,
        createdAt: now,
      });
      const collectorId = await ctx.db.insert("collectors", {
        projectId,
        collectorId: `c_${slug}`,
        name: `${slug} collector`,
        workerType: "browser",
        targetUrl: `https://example.test/${slug}`,
        createdAfterKickoff: true,
        status: "published",
      });
      const runId = await ctx.db.insert("runs", {
        projectId,
        collectorId,
        mode: "baseline",
        status: "verified",
        startedAt: now,
        completedAt: now,
        rowCount: 1,
      });
      await ctx.db.insert("rows", {
        runId,
        entityId: `${slug}-row`,
        rawPayload: { slug },
        normalizedPayload: { slug },
        fieldTrust: { state: "verified" },
        recordHash: `${slug}:record`,
      });
      await ctx.db.insert("evidence", {
        projectId,
        runId,
        kind: "html",
        sourceUrl: `https://example.test/${slug}`,
        contentHash: `${slug}:evidence`,
        metadata: { slug },
        capturedAt: now,
      });
      const incidentId = await ctx.db.insert("incidents", {
        projectId,
        failingRunId: runId,
        collectorId,
        state: "detected",
        failureSummary: `${slug} incident`,
        transitionSequence: 0,
        openedAt: now,
        updatedAt: now,
      });
      const healAttemptId = await ctx.db.insert("healAttempts", {
        projectId,
        incidentId,
        collectorId,
        attempt: 1,
        prompt: `${slug} prompt`,
        promptHash: `${slug}:prompt`,
        status: "approved",
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      });
      const benchmarkRunId = await ctx.db.insert("benchmarkRuns", {
        projectId,
        incidentId,
        healAttemptId,
        suiteRevision: "core-v1",
        baseline: "full_kevlar",
        status: "completed",
        totalCases: 0,
        passedCases: 0,
        criticalFailures: 0,
        falseHealCount: 0,
        falseReleaseCount: 0,
        operationKey: `${slug}:benchmark`,
        startedAt:
          now +
          (slug === "private-project"
            ? 300
            : slug === "kevlar-core"
              ? 200
              : 100),
        completedAt: now + 400,
      });
      const entityId = await ctx.db.insert("canonicalEntities", {
        projectId,
        domainPackId,
        entityType: "product",
        canonicalKey: `${slug}-entity`,
        displayName: `${slug} entity`,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const bundleId = await ctx.db.insert("evidenceBundles", {
        projectId,
        incidentId,
        bundleKey: `${slug}:bundle`,
        status: "sealed",
        digest: `${slug}:digest`,
        manifestDigest: `${slug}:manifest`,
        artifactCount: 0,
        operationKey: `${slug}:bundle:create`,
        createdAt: now,
        sealedAt: now,
      });
      return {
        projectId,
        collectorId,
        runId,
        incidentId,
        entityId,
        bundleId,
        benchmarkRunId,
      };
    };

    return {
      publicProject: await createProject("public-project", "published"),
      privateProject: await createProject("private-project"),
      coreProject: await createProject("kevlar-core"),
    };
  });

  return { t, owner, foreign, ...ids };
}

async function expectRepresentativeReads(
  caller: Pick<ReturnType<typeof convexTest>, "query">,
  ids: {
    incidentId: Id<"incidents">;
    entityId: Id<"canonicalEntities">;
    bundleId: Id<"evidenceBundles">;
  },
) {
  const incident = await caller.query(api.incidents.detail, {
    incidentId: ids.incidentId,
  });
  const timeline = await caller.query(api.phase7Queries.timeline, {
    entityId: ids.entityId,
  });
  const evidence = await caller.query(api.phase9Queries.evidenceBundle, {
    bundleId: ids.bundleId,
  });
  expect(incident?.incident._id).toBe(ids.incidentId);
  expect(timeline?.entity._id).toBe(ids.entityId);
  expect(evidence?.bundle._id).toBe(ids.bundleId);
}

type QueryCaller = Pick<ReturnType<typeof convexTest>, "query">;

const coreAppReadCases: Array<{
  name: string;
  read: (caller: QueryCaller) => Promise<unknown>;
}> = [
  {
    name: "latest baseline",
    read: (caller) => caller.query(api.runs.latestBaseline, {}),
  },
  {
    name: "semantic feed",
    read: (caller) => caller.query(api.semanticGate.feed, {}),
  },
  {
    name: "semantic project status",
    read: (caller) =>
      caller.query(api.semanticGate.projectStatus, { slug: "kevlar-core" }),
  },
  {
    name: "repair gauntlet",
    read: (caller) => caller.query(api.phase4Queries.gauntlet, {}),
  },
  {
    name: "source catalog",
    read: (caller) => caller.query(api.phase5Queries.catalog, {}),
  },
  {
    name: "fleet",
    read: (caller) => caller.query(api.phase5Queries.fleet, { now }),
  },
  {
    name: "fleet dashboard alias",
    read: (caller) => caller.query(api.phase5Fleet.dashboard, { now }),
  },
  {
    name: "mapping view",
    read: (caller) => caller.query(api.phase6Queries.mappings, {}),
  },
  {
    name: "identity graph",
    read: (caller) => caller.query(api.phase6Queries.identityGraph, {}),
  },
  {
    name: "semantic events",
    read: (caller) => caller.query(api.phase8Queries.events, {}),
  },
  {
    name: "semantic conflicts",
    read: (caller) => caller.query(api.phase8Queries.conflicts, {}),
  },
];

async function expectCoreReadsDenied(
  caller: QueryCaller,
  expectedMessage: string,
) {
  for (const item of coreAppReadCases)
    await expect(item.read(caller), item.name).rejects.toThrow(expectedMessage);
}

async function expectCoreReadsAllowed(caller: QueryCaller) {
  for (const item of coreAppReadCases)
    await expect(item.read(caller), item.name).resolves.toBeDefined();
}

describe("project public-read authorization", () => {
  it("allows anonymous reads only for an explicitly published active project", async () => {
    const { t, publicProject, privateProject } = await tenantReadFixture();

    await expectRepresentativeReads(t, publicProject);
    await expect(
      t.query(api.incidents.detail, {
        incidentId: privateProject.incidentId,
      }),
    ).rejects.toThrow("Unauthenticated");
    await expect(
      t.query(api.phase7Queries.timeline, {
        entityId: privateProject.entityId,
      }),
    ).rejects.toThrow("Unauthenticated");
    await expect(
      t.query(api.phase9Queries.evidenceBundle, {
        bundleId: privateProject.bundleId,
      }),
    ).rejects.toThrow("Unauthenticated");
  }, 15_000);

  it("allows a project member and denies a foreign tenant", async () => {
    const { owner, foreign, privateProject } = await tenantReadFixture();

    await expectRepresentativeReads(owner, privateProject);
    await expect(
      foreign.query(api.incidents.detail, {
        incidentId: privateProject.incidentId,
      }),
    ).rejects.toThrow("Forbidden organization operation");
    await expect(
      foreign.query(api.phase7Queries.timeline, {
        entityId: privateProject.entityId,
      }),
    ).rejects.toThrow("Forbidden organization operation");
    await expect(
      foreign.query(api.phase9Queries.evidenceBundle, {
        bundleId: privateProject.bundleId,
      }),
    ).rejects.toThrow("Forbidden organization operation");
  });

  it("publishes and unpublishes only the stable kevlar-core project", async () => {
    const { t, owner, foreign, coreProject, privateProject } =
      await tenantReadFixture();

    await expectCoreReadsDenied(t, "Unauthenticated");
    await expectCoreReadsAllowed(owner);
    await expectCoreReadsDenied(foreign, "Forbidden organization operation");

    await expect(
      t.mutation(api.phase11Access.setKevlarCorePublicRead, {
        ingestKey: "wrong-key",
        published: true,
        operationKey: "test:publication:wrong-key",
      }),
    ).rejects.toThrow("Unauthorized Phase 5 request");

    const published = await t.mutation(
      api.phase11Access.setKevlarCorePublicRead,
      {
        ingestKey,
        published: true,
        operationKey: "test:publication:publish",
      },
    );
    expect(published).toMatchObject({
      _id: coreProject.projectId,
      slug: "kevlar-core",
      publicReadStatus: "published",
    });
    await expectRepresentativeReads(t, coreProject);
    await expectCoreReadsAllowed(t);
    const gauntlet = await t.query(api.phase4Queries.gauntlet, {});
    expect(gauntlet.benchmarkRun?._id).toBe(coreProject.benchmarkRunId);

    const unpublished = await t.mutation(
      api.phase11Access.setKevlarCorePublicRead,
      {
        ingestKey,
        published: false,
        operationKey: "test:publication:unpublish",
      },
    );
    expect(unpublished.publicReadStatus).toBe("private");
    await expectCoreReadsDenied(t, "Unauthenticated");

    const state = await t.run(async (ctx) => ({
      privateProject: await ctx.db.get("projects", privateProject.projectId),
      auditEvents: await ctx.db
        .query("auditEvents")
        .withIndex("by_project_created", (q) =>
          q.eq("projectId", coreProject.projectId),
        )
        .take(10),
    }));
    expect(state.privateProject?.publicReadStatus).toBeUndefined();
    expect(state.auditEvents.map((event) => event.action)).toEqual([
      "project.public_read.published",
      "project.public_read.unpublished",
    ]);
  }, 15_000);
});
