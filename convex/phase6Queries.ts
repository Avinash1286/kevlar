import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { assertProjectScope, requireProjectReadAccess } from "./phase11Auth";

const publicSchemaRevisionValidator = v.object({
  _id: v.id("canonicalSchemaRevisions"),
  domain: v.string(),
  revision: v.number(),
  definition: v.any(),
  definitionHash: v.string(),
  createdAt: v.number(),
});

const publicSchemaStateValidator = v.object({
  _id: v.id("canonicalSchemaRevisionStates"),
  schemaRevisionId: v.id("canonicalSchemaRevisions"),
  fromStatus: v.union(v.string(), v.null()),
  toStatus: v.string(),
  reason: v.string(),
  createdAt: v.number(),
});

const publicSchemaCompatibilityValidator = v.object({
  _id: v.id("canonicalSchemaCompatibility"),
  fromRevisionId: v.id("canonicalSchemaRevisions"),
  toRevisionId: v.id("canonicalSchemaRevisions"),
  classification: v.string(),
  reasons: v.array(v.string()),
  createdAt: v.number(),
});

export const registry = query({
  args: {
    domainPackId: v.optional(v.id("domainPacks")),
    domain: v.optional(v.string()),
  },
  returns: v.object({
    revisions: v.array(publicSchemaRevisionValidator),
    states: v.array(publicSchemaStateValidator),
    compatibility: v.array(publicSchemaCompatibilityValidator),
  }),
  handler: async (ctx, args) => {
    let domainPackId = args.domainPackId;
    if (!domainPackId && !args.domain) {
      const pack = await ctx.db
        .query("domainPacks")
        .withIndex("by_key", (q) => q.eq("key", "ai-infrastructure"))
        .unique();
      domainPackId = pack?._id;
    }
    const revisions = args.domain
      ? await ctx.db
          .query("canonicalSchemaRevisions")
          .withIndex("by_domain_and_revision", (q) =>
            q.eq("domain", args.domain!),
          )
          .order("desc")
          .take(20)
      : domainPackId
        ? await ctx.db
            .query("canonicalSchemaRevisions")
            .withIndex("by_domainPackId_and_revision", (q) =>
              q.eq("domainPackId", domainPackId!),
            )
            .order("desc")
            .take(20)
        : [];
    const states = (
      await Promise.all(
        revisions.map((revision) =>
          ctx.db
            .query("canonicalSchemaRevisionStates")
            .withIndex("by_schemaRevisionId_and_createdAt", (q) =>
              q.eq("schemaRevisionId", revision._id),
            )
            .order("desc")
            .take(20),
        ),
      )
    )
      .flat()
      .slice(0, 200);
    const compatibility = (
      await Promise.all(
        revisions.map((revision) =>
          ctx.db
            .query("canonicalSchemaCompatibility")
            .withIndex("by_toRevisionId", (q) =>
              q.eq("toRevisionId", revision._id),
            )
            .take(20),
        ),
      )
    )
      .flat()
      .slice(0, 200);
    return {
      revisions: revisions.map((revision) => ({
        _id: revision._id,
        domain: revision.domain,
        revision: revision.revision,
        definition: revision.definition,
        definitionHash: revision.definitionHash,
        createdAt: revision.createdAt,
      })),
      states: states.map((state) => ({
        _id: state._id,
        schemaRevisionId: state.schemaRevisionId,
        fromStatus: state.fromStatus,
        toStatus: state.toStatus,
        reason: state.reason,
        createdAt: state.createdAt,
      })),
      compatibility: compatibility.map((item) => ({
        _id: item._id,
        fromRevisionId: item.fromRevisionId,
        toRevisionId: item.toRevisionId,
        classification: item.classification,
        reasons: item.reasons,
        createdAt: item.createdAt,
      })),
    };
  },
});

export const mappings = query({
  args: {
    projectId: v.optional(v.id("projects")),
    sourceId: v.optional(v.id("sources")),
    mappingSpecId: v.optional(v.id("canonicalMappingSpecs")),
  },
  returns: v.object({
    specs: v.array(schema.doc("canonicalMappingSpecs")),
    revisions: v.array(schema.doc("canonicalMappingRevisions")),
    approvals: v.array(schema.doc("canonicalMappingApprovals")),
    transitions: v.array(schema.doc("canonicalMappingTransitions")),
  }),
  handler: async (ctx, args) => {
    let projectId = args.projectId;
    if (!projectId && !args.sourceId && !args.mappingSpecId) {
      const project = await ctx.db
        .query("projects")
        .withIndex("by_slug", (q) => q.eq("slug", "kevlar-core"))
        .unique();
      projectId = project?._id;
    }
    if (projectId) await requireProjectReadAccess(ctx, projectId);
    const directSpec = args.mappingSpecId
      ? await ctx.db.get("canonicalMappingSpecs", args.mappingSpecId)
      : null;
    if (args.mappingSpecId && !directSpec)
      return { specs: [], revisions: [], approvals: [], transitions: [] };
    if (directSpec) {
      if (projectId && directSpec.projectId !== projectId)
        throw new Error("Cross-project data relationship");
      projectId = directSpec.projectId;
      await requireProjectReadAccess(ctx, projectId);
    }
    const specs = directSpec
      ? [directSpec]
      : args.sourceId
        ? await ctx.db
            .query("canonicalMappingSpecs")
            .withIndex("by_sourceId_and_key", (q) =>
              q.eq("sourceId", args.sourceId!),
            )
            .take(30)
        : projectId
          ? await ctx.db
              .query("canonicalMappingSpecs")
              .withIndex("by_projectId_and_createdAt", (q) =>
                q.eq("projectId", projectId!),
              )
              .order("desc")
              .take(30)
          : [];
    if (projectId) assertProjectScope(projectId, specs);
    for (const specProjectId of new Set(specs.map((spec) => spec.projectId)))
      await requireProjectReadAccess(ctx, specProjectId);
    const revisions = (
      await Promise.all(
        specs.map((spec) =>
          ctx.db
            .query("canonicalMappingRevisions")
            .withIndex("by_mappingSpecId_and_revision", (q) =>
              q.eq("mappingSpecId", spec._id),
            )
            .order("desc")
            .take(20),
        ),
      )
    )
      .flat()
      .slice(0, 200);
    const approvals = (
      await Promise.all(
        revisions.map((revision) =>
          ctx.db
            .query("canonicalMappingApprovals")
            .withIndex("by_mappingRevisionId_and_createdAt", (q) =>
              q.eq("mappingRevisionId", revision._id),
            )
            .order("desc")
            .take(10),
        ),
      )
    )
      .flat()
      .slice(0, 200);
    const transitions = (
      await Promise.all(
        revisions.map((revision) =>
          ctx.db
            .query("canonicalMappingTransitions")
            .withIndex("by_mappingRevisionId_and_createdAt", (q) =>
              q.eq("mappingRevisionId", revision._id),
            )
            .order("desc")
            .take(20),
        ),
      )
    )
      .flat()
      .slice(0, 300);
    return { specs, revisions, approvals, transitions };
  },
});

const identityGraphResultValidator = v.object({
  entities: v.array(schema.doc("canonicalEntities")),
  externalIds: v.array(schema.doc("canonicalExternalIds")),
  aliases: v.array(schema.doc("canonicalEntityAliases")),
  lineage: v.array(schema.doc("canonicalEntityLineage")),
  operations: v.array(schema.doc("canonicalEntityOperations")),
  observations: v.array(schema.doc("canonicalObservations")),
  fields: v.array(schema.doc("canonicalObservationFields")),
  resolutions: v.array(schema.doc("canonicalObservationResolutions")),
  candidates: v.array(schema.doc("identityCandidates")),
  decisions: v.array(schema.doc("identityReviewDecisions")),
});

export const identityGraph = query({
  args: {
    projectId: v.optional(v.id("projects")),
    entityId: v.optional(v.id("canonicalEntities")),
  },
  returns: identityGraphResultValidator,
  handler: async (ctx, args) => {
    let projectId = args.projectId;
    const directEntity = args.entityId
      ? await ctx.db.get("canonicalEntities", args.entityId)
      : null;
    if (args.entityId && !directEntity) {
      if (projectId) await requireProjectReadAccess(ctx, projectId);
      return {
        entities: [],
        externalIds: [],
        aliases: [],
        lineage: [],
        operations: [],
        observations: [],
        fields: [],
        resolutions: [],
        candidates: [],
        decisions: [],
      };
    }
    if (directEntity) {
      if (projectId && directEntity.projectId !== projectId)
        throw new Error("Cross-project data relationship");
      projectId = directEntity.projectId;
    }
    if (!projectId) {
      const project = await ctx.db
        .query("projects")
        .withIndex("by_slug", (q) => q.eq("slug", "kevlar-core"))
        .unique();
      projectId = project?._id;
    }
    if (!projectId)
      return {
        entities: [],
        externalIds: [],
        aliases: [],
        lineage: [],
        operations: [],
        observations: [],
        fields: [],
        resolutions: [],
        candidates: [],
        decisions: [],
      };
    await requireProjectReadAccess(ctx, projectId);
    const entities = directEntity
      ? [directEntity]
      : projectId
        ? (
            await Promise.all(
              ["active", "deprecated", "removed", "merged", "split"].map(
                (status) =>
                  ctx.db
                    .query("canonicalEntities")
                    .withIndex("by_projectId_and_status", (q) =>
                      q
                        .eq("projectId", projectId!)
                        .eq(
                          "status",
                          status as Doc<"canonicalEntities">["status"],
                        ),
                    )
                    .take(40),
              ),
            )
          )
            .flat()
            .slice(0, 100)
        : [];
    const entityIds = new Set(entities.map((entity) => entity._id));
    const externalIds = (
      await Promise.all(
        entities.map((entity) =>
          ctx.db
            .query("canonicalExternalIds")
            .withIndex("by_entityId", (q) => q.eq("entityId", entity._id))
            .take(20),
        ),
      )
    )
      .flat()
      .slice(0, 200);
    const aliases = (
      await Promise.all(
        entities.map((entity) =>
          ctx.db
            .query("canonicalEntityAliases")
            .withIndex("by_entityId_and_status", (q) =>
              q.eq("entityId", entity._id),
            )
            .take(20),
        ),
      )
    )
      .flat()
      .slice(0, 200);
    const lineage = (
      await Promise.all(
        entities.flatMap((entity) => [
          ctx.db
            .query("canonicalEntityLineage")
            .withIndex("by_fromEntityId_and_status", (q) =>
              q.eq("fromEntityId", entity._id),
            )
            .take(20),
          ctx.db
            .query("canonicalEntityLineage")
            .withIndex("by_toEntityId_and_status", (q) =>
              q.eq("toEntityId", entity._id),
            )
            .take(20),
        ]),
      )
    )
      .flat()
      .filter(
        (item, index, all) =>
          all.findIndex((candidate) => candidate._id === item._id) === index,
      )
      .slice(0, 200);
    const operations = projectId
      ? await ctx.db
          .query("canonicalEntityOperations")
          .withIndex("by_projectId_and_createdAt", (q) =>
            q.eq("projectId", projectId!),
          )
          .order("desc")
          .take(100)
      : [];
    const baseObservations = args.entityId
      ? await ctx.db
          .query("canonicalObservations")
          .withIndex("by_resolvedEntityId_and_observedAt", (q) =>
            q.eq("resolvedEntityId", args.entityId),
          )
          .order("desc")
          .take(50)
      : projectId
        ? await ctx.db
            .query("canonicalObservations")
            .withIndex("by_projectId_and_recordedAt", (q) =>
              q.eq("projectId", projectId!),
            )
            .order("desc")
            .take(100)
        : [];
    const entityCandidates = args.entityId
      ? await ctx.db
          .query("identityCandidates")
          .withIndex("by_candidateEntityId_and_createdAt", (q) =>
            q.eq("candidateEntityId", args.entityId!),
          )
          .order("desc")
          .take(50)
      : [];
    const candidateObservationIds = new Set(
      entityCandidates.map((candidate) => candidate.observationId),
    );
    const candidateObservations = await Promise.all(
      [...candidateObservationIds]
        .slice(0, 50)
        .map((id) => ctx.db.get("canonicalObservations", id)),
    );
    const observations = [
      ...baseObservations,
      ...candidateObservations.filter(
        (item): item is Doc<"canonicalObservations"> => item !== null,
      ),
    ]
      .filter(
        (item, index, all) =>
          all.findIndex((candidate) => candidate._id === item._id) === index,
      )
      .slice(0, 100);
    const fields = (
      await Promise.all(
        observations.map((observation) =>
          ctx.db
            .query("canonicalObservationFields")
            .withIndex("by_observationId", (q) =>
              q.eq("observationId", observation._id),
            )
            .take(100),
        ),
      )
    )
      .flat()
      .slice(0, 500);
    const resolutions = (
      await Promise.all(
        observations.map((observation) =>
          ctx.db
            .query("canonicalObservationResolutions")
            .withIndex("by_observationId_and_createdAt", (q) =>
              q.eq("observationId", observation._id),
            )
            .order("desc")
            .take(10),
        ),
      )
    )
      .flat()
      .slice(0, 200);
    const candidates = (
      await Promise.all(
        observations.map((observation) =>
          ctx.db
            .query("identityCandidates")
            .withIndex("by_observationId_and_score", (q) =>
              q.eq("observationId", observation._id),
            )
            .order("desc")
            .take(20),
        ),
      )
    )
      .flat()
      .filter(
        (candidate) =>
          !args.entityId || entityIds.has(candidate.candidateEntityId),
      )
      .slice(0, 200);
    const decisions = (
      await Promise.all(
        candidates.map((candidate) =>
          ctx.db
            .query("identityReviewDecisions")
            .withIndex("by_candidateId_and_createdAt", (q) =>
              q.eq("candidateId", candidate._id),
            )
            .order("desc")
            .take(10),
        ),
      )
    )
      .flat()
      .slice(0, 200);
    assertProjectScope(projectId, [
      ...entities,
      ...externalIds,
      ...aliases,
      ...lineage,
      ...operations,
      ...observations,
      ...fields,
      ...resolutions,
      ...candidates,
      ...decisions,
    ]);
    return {
      entities,
      externalIds,
      aliases,
      lineage,
      operations,
      observations,
      fields,
      resolutions,
      candidates,
      decisions,
    };
  },
});

export const proof = query({
  args: { key: v.optional(v.string()) },
  returns: v.union(
    v.object({
      proof: v.object({ _id: v.id("phase6Proofs") }),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const proof = await ctx.db
      .query("phase6Proofs")
      .withIndex("by_key", (q) =>
        q.eq("key", args.key ?? "phase6:ai-infrastructure:identity-proof:v1"),
      )
      .unique();
    if (!proof) return null;
    await requireProjectReadAccess(ctx, proof.projectId);
    const [schemaRevision, resolvedEntity, mappingRevisions, observations] =
      await Promise.all([
        ctx.db.get("canonicalSchemaRevisions", proof.schemaRevisionId),
        ctx.db.get("canonicalEntities", proof.resolvedEntityId),
        Promise.all(
          proof.mappingRevisionIds
            .slice(0, 20)
            .map((id) => ctx.db.get("canonicalMappingRevisions", id)),
        ),
        Promise.all(
          proof.observationIds
            .slice(0, 20)
            .map((id) => ctx.db.get("canonicalObservations", id)),
        ),
      ]);
    if (!schemaRevision || !resolvedEntity)
      throw new Error("Phase 6 proof references missing canonical roots");
    const presentMappings = mappingRevisions.filter(
      (item): item is Doc<"canonicalMappingRevisions"> => item !== null,
    );
    const mappingOwners = (
      await Promise.all(
        [
          ...new Set(presentMappings.map((mapping) => mapping.mappingSpecId)),
        ].map((id) => ctx.db.get("canonicalMappingSpecs", id)),
      )
    ).filter((item): item is Doc<"canonicalMappingSpecs"> => item !== null);
    if (
      mappingOwners.length !==
      new Set(presentMappings.map((mapping) => mapping.mappingSpecId)).size
    )
      throw new Error("Phase 6 proof mapping owner is missing");
    const presentObservations = observations.filter(
      (item): item is Doc<"canonicalObservations"> => item !== null,
    );
    const [observationFields, ambiguousCandidates, operations] =
      await Promise.all([
        Promise.all(
          presentObservations.map((observation) =>
            ctx.db
              .query("canonicalObservationFields")
              .withIndex("by_observationId", (q) =>
                q.eq("observationId", observation._id),
              )
              .take(100),
          ),
        ),
        Promise.all(
          proof.ambiguousCandidateIds
            .slice(0, 20)
            .map((id) => ctx.db.get("identityCandidates", id)),
        ),
        Promise.all(
          proof.entityOperationIds
            .slice(0, 20)
            .map((id) => ctx.db.get("canonicalEntityOperations", id)),
        ),
      ]);
    const presentCandidates = ambiguousCandidates.filter(
      (item): item is Doc<"identityCandidates"> => item !== null,
    );
    const presentOperations = operations.filter(
      (item): item is Doc<"canonicalEntityOperations"> => item !== null,
    );
    const decisions = (
      await Promise.all(
        presentCandidates.map((candidate) =>
          ctx.db
            .query("identityReviewDecisions")
            .withIndex("by_candidateId_and_createdAt", (q) =>
              q.eq("candidateId", candidate._id),
            )
            .take(10),
        ),
      )
    ).flat();
    const lineage = (
      await Promise.all(
        presentOperations.map((operation) =>
          ctx.db
            .query("canonicalEntityLineage")
            .withIndex("by_operationId", (q) =>
              q.eq("operationId", operation._id),
            )
            .take(20),
        ),
      )
    ).flat();
    assertProjectScope(proof.projectId, [
      proof,
      resolvedEntity,
      ...mappingOwners,
      ...presentObservations,
      ...observationFields.flat(),
      ...presentCandidates,
      ...decisions,
      ...presentOperations,
      ...lineage,
    ]);
    return {
      proof: { _id: proof._id },
    };
  },
});
