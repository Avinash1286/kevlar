import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const modules = import.meta.glob("./**/*.ts");
const upsertPolicyRef = makeFunctionReference<"mutation">(
  "phase12Retention:upsertPolicy",
);
const runRetentionRef = makeFunctionReference<"mutation">(
  "phase12Retention:run",
);
const requestDeletionRef = makeFunctionReference<"mutation">(
  "phase12Deletion:request",
);
const verifyRestoreRef = makeFunctionReference<"mutation">(
  "phase12Recovery:verifyRestore",
);

async function fixture() {
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
  });
  const foreign = t.withIdentity({
    subject: String(providerUsers.foreign),
    issuer: "https://auth.test",
    tokenIdentifier: `https://auth.test|${providerUsers.foreign}`,
  });
  const ownerUser = await owner.mutation(api.phase11Access.syncCurrentUser, {});
  const foreignUser = await foreign.mutation(
    api.phase11Access.syncCurrentUser,
    {},
  );
  const ids = await t.run(async (ctx) => {
    const now = 1_787_400_000_000;
    const organizationId = await ctx.db.insert("organizations", {
      slug: "phase12-owner",
      name: "Owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const foreignOrganizationId = await ctx.db.insert("organizations", {
      slug: "phase12-foreign",
      name: "Foreign",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
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
    const projectId = await ctx.db.insert("projects", {
      name: "Retention project",
      slug: "phase12-retention",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("projectTenancies", {
      projectId,
      organizationId,
      createdAt: now,
    });
    const evidenceId = await ctx.db.insert("evidence", {
      projectId,
      kind: "html",
      sourceUrl: "https://example.test/private",
      contentHash: "hash-preserved",
      metadata: { secret: "delete-me" },
      capturedAt: now - 3 * 86_400_000,
    });
    const backupExportRecordId = await ctx.db.insert("backupExportRecords", {
      organizationId,
      projectId,
      kind: "backup",
      status: "completed",
      snapshotRef: "test://snapshot",
      digest: "test-digest",
      requestedAt: now,
      completedAt: now,
      operationKey: "phase12:test:backup",
    });
    const capturedManifestId = await ctx.db.insert("backupRestoreManifests", {
      organizationId,
      projectId,
      backupExportRecordId,
      snapshotRef: "test://snapshot",
      sourceDeployment: "test",
      restoreTarget: "test",
      counts: {
        certificates: 0,
        currentFacts: 0,
        factVersions: 0,
        changeEvents: 0,
        evidenceBundles: 0,
        canonicalObservations: 0,
        sourceCount: 0,
        truncated: false,
      },
      expectedDigest: "test-digest",
      status: "captured",
      operationKey: "phase12:test:manifest",
      capturedAt: now,
    });
    return { projectId, evidenceId, organizationId, capturedManifestId };
  });
  return { t, owner, foreign, ...ids };
}

describe("Phase 12 retention and deletion authorization", () => {
  it("blocks a foreign owner from configuring another tenant's retention", async () => {
    const { foreign, projectId } = await fixture();
    await expect(
      foreign.mutation(upsertPolicyRef, {
        projectId,
        scope: "evidence",
        kind: "html",
        retentionDays: 1,
        action: "redact_payload",
        preserveCertified: true,
        enabled: true,
        operationKey: "phase12:test:foreign-policy",
      }),
    ).rejects.toThrow(/Forbidden|organization/i);
  });

  it("redacts expired payload while preserving its integrity hash", async () => {
    const { t, owner, projectId, evidenceId } = await fixture();
    const configured = await owner.mutation(upsertPolicyRef, {
      projectId,
      scope: "evidence",
      kind: "html",
      retentionDays: 1,
      action: "redact_payload",
      preserveCertified: true,
      enabled: true,
      operationKey: "phase12:test:policy",
    });
    const result = await owner.mutation(runRetentionRef, {
      policyId: configured.policy._id,
      asOf: 1_787_400_000_000,
      operationKey: "phase12:test:run",
    });
    expect(result.run).toMatchObject({
      status: "completed",
      redacted: 1,
      hasMore: false,
    });
    const evidence = await t.run((ctx) => ctx.db.get("evidence", evidenceId));
    expect(evidence).toMatchObject({
      sourceUrl: "[REDACTED_BY_RETENTION]",
      contentHash: "hash-preserved",
      metadata: { redacted: true },
    });
  });

  it("refuses project deletion without a verified same-project restore manifest", async () => {
    const { owner, projectId, capturedManifestId } = await fixture();
    await expect(
      owner.mutation(requestDeletionRef, {
        projectId,
        backupRestoreManifestId: capturedManifestId,
        reason: "Requested privacy deletion",
        operationKey: "phase12:test:delete",
      }),
    ).rejects.toThrow("verified same-project");
  });

  it("does not certify a truncated restore manifest", async () => {
    const { t, owner, capturedManifestId } = await fixture();
    await t.run((ctx) =>
      ctx.db.patch("backupRestoreManifests", capturedManifestId, {
        counts: {
          certificates: 1_000,
          currentFacts: 0,
          factVersions: 0,
          changeEvents: 0,
          evidenceBundles: 0,
          canonicalObservations: 0,
          sourceCount: 0,
          truncated: true,
        },
      }),
    );
    const result = await owner.mutation(verifyRestoreRef, {
      manifestId: capturedManifestId,
      operationKey: "phase12:test:verify-truncated",
    });
    expect(result).toMatchObject({
      verified: false,
      manifest: { status: "mismatch" },
    });
  });
});
