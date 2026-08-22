import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

type Policy = "global" | "visibility" | "role" | "publication";
type InventoryItem = {
  ref: string;
  policy: Policy;
  token?: string;
  rationale?: string;
};

const inventory: InventoryItem[] = [
  {
    ref: "fixtureState:getNova",
    policy: "global",
    rationale:
      "Public fixture-lab version metadata; no tenant identifier or payload.",
  },
  {
    ref: "phase6Queries:registry",
    policy: "global",
    rationale: "Global canonical schema registry; project data is not joined.",
  },
  {
    ref: "phase5Catalog:sourceByKey",
    policy: "visibility",
    token: "source.visibility",
    rationale:
      "Only public sources are anonymous; authenticated sources require a user and private sources are hidden.",
  },
  {
    ref: "phase10Deliveries:delivery",
    policy: "role",
    token: "requireProjectRole",
  },
  {
    ref: "phase11Access:organizationsForCurrentUser",
    policy: "role",
    token: "requireAuthUser",
  },
  {
    ref: "phase11Access:tenantOverview",
    policy: "role",
    token: "requireOrganizationRole",
  },
  {
    ref: "phase11Operations:operations",
    policy: "role",
    token: "requireOrganizationRole",
  },
  { ref: "phase11Router:queue", policy: "role", token: "requireProjectRole" },
  {
    ref: "phase12Queries:retention",
    policy: "role",
    token: "requireProjectRole",
  },
  {
    ref: "phase12Queries:projectDeletion",
    policy: "role",
    token: "requireProjectRole",
  },
  {
    ref: "phase12Queries:recovery",
    policy: "role",
    token: "requireProjectRole",
  },
  {
    ref: "incidents:detail",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "incidents:timeline",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase4Queries:incidentCourtroom",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase4Queries:certificateBySlug",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase4Queries:gauntlet",
    policy: "publication",
    token: "resolveKevlarReleaseProjectReadAccess",
  },
  {
    ref: "phase5Catalog:bindingById",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase5Fleet:dashboard",
    policy: "publication",
    token: "readKevlarCoreFleet",
  },
  {
    ref: "phase5Queries:catalog",
    policy: "publication",
    token: "resolveKevlarReleaseProjectReadAccess",
  },
  {
    ref: "phase5Queries:fleet",
    policy: "publication",
    token: "readKevlarCoreFleet",
  },
  {
    ref: "phase6Queries:mappings",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase6Queries:identityGraph",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase6Queries:proof",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase7Queries:timeline",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase7Queries:history",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase7Queries:proof",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase8Queries:events",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase8Queries:conflicts",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase8Queries:courtroom",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase8Queries:proof",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase9Queries:evidenceGraph",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase9Queries:evidenceBundle",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase9Queries:blastRadius",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase9Queries:fleet",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase9Queries:proof",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase10Proof:proof",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase11Proof:proof",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "phase12Proof:proof",
    policy: "publication",
    token: "requireProjectReadAccess",
  },
  {
    ref: "runs:latestBaseline",
    policy: "publication",
    token: "resolveKevlarReleaseProjectReadAccess",
  },
  {
    ref: "semanticGate:feed",
    policy: "publication",
    token: "resolveKevlarReleaseProjectReadAccess",
  },
  {
    ref: "semanticGate:projectStatus",
    policy: "publication",
    token: "resolveKevlarReleaseProjectReadAccess",
  },
];

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory())
      return entry.name === "_generated" ? [] : filesBelow(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

function publicQueryBlocks() {
  const convexDirectory = resolve(process.cwd(), "convex");
  const blocks = new Map<string, string>();
  for (const path of filesBelow(convexDirectory)) {
    const source = readFileSync(path, "utf8");
    const moduleName = relative(convexDirectory, path)
      .replaceAll("\\", "/")
      .replace(/\.ts$/, "");
    const matches = [...source.matchAll(/^export const (\w+) = query\(\{/gm)];
    for (const [index, match] of matches.entries()) {
      const start = match.index;
      const nextExport = source.indexOf("\nexport const ", start + 1);
      const end = nextExport === -1 ? source.length : nextExport;
      blocks.set(`${moduleName}:${match[1]}`, source.slice(start, end));
      expect(index).toBeGreaterThanOrEqual(0);
    }
  }
  return blocks;
}

describe("public Convex query authorization inventory", () => {
  it("classifies every public query and proves its declared gate is present", () => {
    const blocks = publicQueryBlocks();
    expect([...blocks.keys()].sort()).toEqual(
      inventory.map((item) => item.ref).sort(),
    );
    for (const item of inventory) {
      const block = blocks.get(item.ref);
      expect(block, item.ref).toBeDefined();
      if (item.token) expect(block, item.ref).toContain(item.token);
      if (item.policy === "global")
        expect(item.rationale?.length, item.ref).toBeGreaterThan(20);
      if (item.policy === "visibility") {
        expect(block, item.ref).toContain("requireAuthUser");
        expect(block, item.ref).toContain('source.visibility === "private"');
      }
    }
    expect(inventory.filter((item) => item.policy === "global")).toHaveLength(
      2,
    );
    expect(
      inventory.filter((item) => item.policy === "visibility"),
    ).toHaveLength(1);
    expect(inventory.filter((item) => item.policy === "role")).toHaveLength(8);
    expect(
      inventory.filter((item) => item.policy === "publication"),
    ).toHaveLength(30);
  });

  it("keeps public operational DTOs free of raw secrets and payloads", () => {
    const fleetSource = readFileSync(
      resolve(process.cwd(), "convex/phase5PublicRead.ts"),
      "utf8",
    );
    for (const forbidden of [
      "leaseToken",
      "workerId",
      "operationKey",
      "lastError",
      "item.raw",
      "item.normalized",
    ])
      expect(fleetSource).not.toContain(forbidden);
    const catalogSource = readFileSync(
      resolve(process.cwd(), "convex/phase5Queries.ts"),
      "utf8",
    );
    expect(catalogSource).toContain(
      "endpointById.get(certification.endpointId)?.sourceId",
    );
    expect(catalogSource).toContain(
      "endpointById.get(binding.endpointId)?.sourceId",
    );

    const blocks = publicQueryBlocks();
    const phase10Returns = blocks
      .get("phase10Proof:proof")!
      .split("handler:")[0];
    expect(phase10Returns).not.toContain('schema.doc("webhookDeliveries")');
    expect(phase10Returns).not.toContain(
      'schema.doc("webhookDeliveryAttempts")',
    );
    expect(phase10Returns).not.toContain('schema.doc("webhookEndpoints")');

    const phase11Returns = blocks
      .get("phase11Proof:proof")!
      .split("handler:")[0];
    expect(phase11Returns).not.toContain('schema.doc("securityAuditEvents")');
    expect(phase11Returns).not.toContain("proposedChange");
    const phase11Block = blocks.get("phase11Proof:proof")!;
    expect(phase11Block).toContain('ctx.db.get("evidence"');
    expect(phase11Block).toContain("...evidence");

    const phase12Block = blocks.get("phase12Proof:proof")!;
    const phase12Returns = phase12Block.split("handler:")[0];
    expect(phase12Returns).not.toContain(
      'schema.doc("projectDeletionTombstones")',
    );
    expect(phase12Returns).not.toContain(
      'schema.doc("backupRestoreManifests")',
    );
    expect(phase12Block).not.toContain("proof.disposableProjectId");
    expect(phase12Block).not.toContain("evidenceRetentionPolicies");
    expect(phase12Block).not.toContain("evidenceRetentionRuns");
    expect(phase12Block).not.toContain("projectDeletionTombstones");
  });

  it("projects the global schema registry without actor or operation metadata", async () => {
    const t = convexTest(schema, modules);
    const domainPackId = await t.run(async (ctx) => {
      const now = 1_787_400_000;
      const packId = await ctx.db.insert("domainPacks", {
        key: "registry-projection-test",
        name: "Registry projection test",
        version: "1.0.0",
        status: "active",
        coreRequired: true,
        createdAt: now,
        updatedAt: now,
      });
      const firstRevisionId = await ctx.db.insert("canonicalSchemaRevisions", {
        domainPackId: packId,
        domain: "registry-test",
        revision: 1,
        definition: { fields: [] },
        definitionHash: "revision-one",
        createdBy: "private-actor",
        operationKey: "private-revision-operation",
        createdAt: now,
      });
      const secondRevisionId = await ctx.db.insert("canonicalSchemaRevisions", {
        domainPackId: packId,
        domain: "registry-test",
        revision: 2,
        definition: { fields: [] },
        definitionHash: "revision-two",
        createdBy: "private-actor",
        operationKey: "private-revision-operation-two",
        createdAt: now + 1,
      });
      await ctx.db.insert("canonicalSchemaRevisionStates", {
        domainPackId: packId,
        schemaRevisionId: secondRevisionId,
        fromStatus: "draft",
        toStatus: "active",
        actor: "private-reviewer",
        reason: "Approved canonical revision",
        operationKey: "private-state-operation",
        createdAt: now + 2,
      });
      await ctx.db.insert("canonicalSchemaCompatibility", {
        domainPackId: packId,
        fromRevisionId: firstRevisionId,
        toRevisionId: secondRevisionId,
        classification: "backward_compatible",
        reasons: ["Optional field only"],
        migration: { internalScript: "private-migration" },
        operationKey: "private-compatibility-operation",
        createdAt: now + 3,
      });
      return packId;
    });

    const result = await t.query(api.phase6Queries.registry, { domainPackId });
    const json = JSON.stringify(result);
    for (const forbidden of [
      "createdBy",
      "actor",
      "operationKey",
      "migration",
      "private-actor",
      "private-reviewer",
      "private-migration",
    ])
      expect(json).not.toContain(forbidden);
    expect(result.revisions).toHaveLength(2);
    expect(result.states).toHaveLength(1);
    expect(result.compatibility).toHaveLength(1);
  });
});
