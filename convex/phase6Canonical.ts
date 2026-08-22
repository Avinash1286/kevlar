import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requirePhase5IngestKey } from "./phase5Auth";
import {
  canonicalFieldStateValidator,
  canonicalObservationTrustValidator,
} from "./phase6Validators";
import {
  allowedMappingTransforms,
  assertPhase6Text,
  normalizeIdentity,
} from "./phase6Support";

const canonicalFieldInputValidator = v.object({
  canonicalPath: v.string(),
  rawValue: v.any(),
  normalizedValue: v.any(),
  normalizedValueHash: v.string(),
  unit: v.optional(v.string()),
  originalUnit: v.optional(v.string()),
  state: canonicalFieldStateValidator,
  sourcePaths: v.array(v.string()),
  evidenceRefs: v.array(v.id("evidence")),
  transform: v.object({
    name: v.string(),
    version: v.string(),
    input: v.any(),
  }),
});

export const recordObservation = mutation({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    sourceId: v.id("sources"),
    endpointId: v.id("sourceEndpoints"),
    collectorBindingId: v.id("collectorBindings"),
    sourceObservationId: v.optional(v.id("aiInfrastructureObservations")),
    fixtureKey: v.optional(v.string()),
    inputKind: v.union(
      v.literal("verified_source"),
      v.literal("stored_fixture"),
    ),
    mappingRevisionId: v.id("canonicalMappingRevisions"),
    canonicalSchemaRevisionId: v.id("canonicalSchemaRevisions"),
    sourceEntityKey: v.string(),
    entityType: v.string(),
    trustState: canonicalObservationTrustValidator,
    observedAt: v.number(),
    payloadHash: v.string(),
    identity: v.object({
      namespace: v.string(),
      externalId: v.string(),
      canonicalKey: v.string(),
      displayName: v.string(),
    }),
    fields: v.array(canonicalFieldInputValidator),
    operationKey: v.string(),
  },
  returns: v.object({
    observationId: v.id("canonicalObservations"),
    resolvedEntityId: v.union(v.id("canonicalEntities"), v.null()),
    candidateIds: v.array(v.id("identityCandidates")),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    for (const [name, value, max] of [
      ["sourceEntityKey", args.sourceEntityKey, 300],
      ["entityType", args.entityType, 120],
      ["payloadHash", args.payloadHash, 240],
      ["identity.namespace", args.identity.namespace, 120],
      ["identity.externalId", args.identity.externalId, 300],
      ["identity.canonicalKey", args.identity.canonicalKey, 300],
      ["identity.displayName", args.identity.displayName, 300],
      ["operationKey", args.operationKey, 200],
    ] as const)
      assertPhase6Text(value, name, max);
    if (args.fields.length < 1 || args.fields.length > 100)
      throw new Error("Canonical observation requires 1-100 fields");
    if (
      (args.inputKind === "verified_source" && !args.sourceObservationId) ||
      (args.inputKind === "stored_fixture" && !args.fixtureKey)
    )
      throw new Error("Observation input reference does not match inputKind");
    const duplicate = await ctx.db
      .query("canonicalObservations")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (duplicate) {
      if (
        duplicate.sourceId !== args.sourceId ||
        duplicate.sourceEntityKey !== args.sourceEntityKey ||
        duplicate.payloadHash !== args.payloadHash
      )
        throw new Error(
          "operationKey belongs to another canonical observation",
        );
      const candidates = await ctx.db
        .query("identityCandidates")
        .withIndex("by_observationId_and_score", (q) =>
          q.eq("observationId", duplicate._id),
        )
        .take(20);
      return {
        observationId: duplicate._id,
        resolvedEntityId: duplicate.resolvedEntityId ?? null,
        candidateIds: candidates.map((candidate) => candidate._id),
        duplicate: true,
      };
    }
    const [project, source, endpoint, binding, mapping, schemaRevision] =
      await Promise.all([
        ctx.db.get("projects", args.projectId),
        ctx.db.get("sources", args.sourceId),
        ctx.db.get("sourceEndpoints", args.endpointId),
        ctx.db.get("collectorBindings", args.collectorBindingId),
        ctx.db.get("canonicalMappingRevisions", args.mappingRevisionId),
        ctx.db.get("canonicalSchemaRevisions", args.canonicalSchemaRevisionId),
      ]);
    if (
      !project ||
      !source ||
      !endpoint ||
      !binding ||
      !mapping ||
      !schemaRevision ||
      endpoint.sourceId !== source._id ||
      binding.sourceId !== source._id ||
      binding.endpointId !== endpoint._id ||
      mapping.canonicalSchemaRevisionId !== schemaRevision._id
    )
      throw new Error("Canonical observation context is invalid");
    const mappingSpec = await ctx.db.get(
      "canonicalMappingSpecs",
      mapping.mappingSpecId,
    );
    if (
      !mappingSpec ||
      mappingSpec.projectId !== project._id ||
      mappingSpec.sourceId !== source._id ||
      mappingSpec.entityType !== args.entityType
    )
      throw new Error("Mapping spec does not match observation source");
    const [mappingState, schemaState, sourceObservation] = await Promise.all([
      ctx.db
        .query("canonicalMappingTransitions")
        .withIndex("by_mappingRevisionId_and_createdAt", (q) =>
          q.eq("mappingRevisionId", mapping._id),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("canonicalSchemaRevisionStates")
        .withIndex("by_schemaRevisionId_and_createdAt", (q) =>
          q.eq("schemaRevisionId", schemaRevision._id),
        )
        .order("desc")
        .first(),
      args.sourceObservationId
        ? ctx.db.get("aiInfrastructureObservations", args.sourceObservationId)
        : null,
    ]);
    if (
      mappingState?.toStatus !== "active" ||
      schemaState?.toStatus !== "active"
    )
      throw new Error("Canonical mapping and schema must both be active");
    if (
      args.inputKind === "verified_source" &&
      (!sourceObservation ||
        sourceObservation.sourceId !== source._id ||
        sourceObservation.bindingId !== binding._id ||
        sourceObservation.trust !== "verified")
    )
      throw new Error(
        "Live canonicalization requires a verified source observation",
      );
    const mappingFields = (
      mapping.specification as { fields?: Array<{ target?: unknown }> }
    ).fields;
    const allowedTargets = new Set(
      Array.isArray(mappingFields)
        ? mappingFields
            .map((field) => field.target)
            .filter((target): target is string => typeof target === "string")
        : [],
    );
    const evidenceIds = new Set<Id<"evidence">>();
    for (const field of args.fields) {
      assertPhase6Text(field.canonicalPath, "canonicalPath", 300);
      assertPhase6Text(field.normalizedValueHash, "normalizedValueHash", 240);
      assertPhase6Text(field.transform.version, "transform.version", 80);
      if (!allowedTargets.has(field.canonicalPath))
        throw new Error(
          `Mapping revision does not define ${field.canonicalPath}`,
        );
      if (!allowedMappingTransforms.has(field.transform.name))
        throw new Error(
          `Transform is not allowlisted: ${field.transform.name}`,
        );
      if (field.sourcePaths.length < 1 || field.sourcePaths.length > 20)
        throw new Error("Each canonical field requires 1-20 source paths");
      if (field.evidenceRefs.length > 20)
        throw new Error(
          "Each canonical field supports at most 20 evidence refs",
        );
      for (const evidenceId of field.evidenceRefs) evidenceIds.add(evidenceId);
    }
    if (evidenceIds.size > 50)
      throw new Error("Observation supports at most 50 distinct evidence refs");
    for (const evidenceId of evidenceIds) {
      const evidence = await ctx.db.get("evidence", evidenceId);
      if (!evidence || evidence.projectId !== project._id)
        throw new Error(
          "Evidence reference is outside the observation project",
        );
    }

    const normalizedExternalId = normalizeIdentity(args.identity.externalId);
    const externalMatches = await ctx.db
      .query("canonicalExternalIds")
      .withIndex("by_projectId_and_namespace_and_normalizedExternalId", (q) =>
        q
          .eq("projectId", project._id)
          .eq("namespace", args.identity.namespace)
          .eq("normalizedExternalId", normalizedExternalId),
      )
      .take(20);
    const aliasMatches = await ctx.db
      .query("canonicalEntityAliases")
      .withIndex("by_projectId_and_normalizedValue", (q) =>
        q
          .eq("projectId", project._id)
          .eq("normalizedValue", normalizedExternalId),
      )
      .take(20);
    const exactEntityIds = new Set(
      externalMatches
        .filter((external) => external.status === "active")
        .map((external) => external.entityId),
    );
    const aliasEntityIds = new Set(
      aliasMatches
        .filter((alias) => alias.status === "active")
        .map((alias) => alias.entityId),
    );
    let resolvedEntityId: Id<"canonicalEntities"> | undefined;
    let resolutionMethod:
      | "exact_external_id"
      | "approved_alias"
      | "canonical_key"
      | "created_entity"
      | undefined;
    const ambiguousEntityIds = new Set<Id<"canonicalEntities">>();
    if (exactEntityIds.size === 1) {
      resolvedEntityId = [...exactEntityIds][0];
      resolutionMethod = "exact_external_id";
    } else if (exactEntityIds.size > 1)
      for (const entityId of exactEntityIds) ambiguousEntityIds.add(entityId);
    else if (aliasEntityIds.size === 1) {
      resolvedEntityId = [...aliasEntityIds][0];
      resolutionMethod = "approved_alias";
    } else if (aliasEntityIds.size > 1)
      for (const entityId of aliasEntityIds) ambiguousEntityIds.add(entityId);
    if (!resolvedEntityId && ambiguousEntityIds.size === 0) {
      const existingEntity = await ctx.db
        .query("canonicalEntities")
        .withIndex("by_projectId_and_entityType_and_canonicalKey", (q) =>
          q
            .eq("projectId", project._id)
            .eq("entityType", args.entityType)
            .eq("canonicalKey", args.identity.canonicalKey),
        )
        .unique();
      if (existingEntity) {
        resolvedEntityId = existingEntity._id;
        resolutionMethod = "canonical_key";
      } else {
        resolvedEntityId = await ctx.db.insert("canonicalEntities", {
          projectId: project._id,
          domainPackId: source.domainPackId,
          entityType: args.entityType,
          canonicalKey: args.identity.canonicalKey,
          displayName: args.identity.displayName,
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        resolutionMethod = "created_entity";
      }
    }
    if (resolvedEntityId) {
      const sourceExternal = await ctx.db
        .query("canonicalExternalIds")
        .withIndex(
          "by_projectId_and_sourceId_and_namespace_and_normalizedExternalId",
          (q) =>
            q
              .eq("projectId", project._id)
              .eq("sourceId", source._id)
              .eq("namespace", args.identity.namespace)
              .eq("normalizedExternalId", normalizedExternalId),
        )
        .unique();
      if (!sourceExternal)
        await ctx.db.insert("canonicalExternalIds", {
          projectId: project._id,
          entityId: resolvedEntityId,
          sourceId: source._id,
          namespace: args.identity.namespace,
          externalId: args.identity.externalId,
          normalizedExternalId,
          status: "active",
          operationKey: `${args.operationKey}:external-id`,
          createdAt: Date.now(),
        });
    }
    const now = Date.now();
    const trustState =
      ambiguousEntityIds.size > 0 ? ("needs_review" as const) : args.trustState;
    const observationId = await ctx.db.insert("canonicalObservations", {
      projectId: project._id,
      sourceId: source._id,
      endpointId: endpoint._id,
      collectorBindingId: binding._id,
      ...(sourceObservation
        ? { sourceObservationId: sourceObservation._id }
        : {}),
      ...(args.fixtureKey ? { fixtureKey: args.fixtureKey } : {}),
      inputKind: args.inputKind,
      mappingRevisionId: mapping._id,
      canonicalSchemaRevisionId: schemaRevision._id,
      sourceEntityKey: args.sourceEntityKey,
      entityType: args.entityType,
      ...(resolvedEntityId ? { resolvedEntityId } : {}),
      trustState,
      observedAt: args.observedAt,
      recordedAt: now,
      payloadHash: args.payloadHash,
      operationKey: args.operationKey,
    });
    if (resolvedEntityId && resolutionMethod)
      await ctx.db.insert("canonicalObservationResolutions", {
        projectId: project._id,
        observationId,
        entityId: resolvedEntityId,
        method: resolutionMethod,
        operationKey: `${args.operationKey}:resolution`,
        createdAt: now,
      });
    for (const field of args.fields)
      await ctx.db.insert("canonicalObservationFields", {
        observationId,
        projectId: project._id,
        canonicalPath: field.canonicalPath,
        rawValue: field.rawValue,
        normalizedValue: field.normalizedValue,
        normalizedValueHash: field.normalizedValueHash,
        ...(field.unit ? { unit: field.unit } : {}),
        ...(field.originalUnit ? { originalUnit: field.originalUnit } : {}),
        state: field.state,
        sourcePaths: field.sourcePaths,
        evidenceRefs: field.evidenceRefs,
        transform: field.transform,
        mappingRevisionId: mapping._id,
        createdAt: now,
      });
    const candidateIds = [];
    for (const candidateEntityId of [...ambiguousEntityIds].slice(0, 10)) {
      const fromExternal = exactEntityIds.has(candidateEntityId);
      const candidateId = await ctx.db.insert("identityCandidates", {
        projectId: project._id,
        observationId,
        candidateEntityId,
        score: fromExternal ? 80 : 55,
        features: [
          {
            name: fromExternal ? "exact_provider_model_id" : "approved_alias",
            matched: true,
            weight: fromExternal ? 80 : 35,
            explanation: fromExternal
              ? "Normalized external identifier matched."
              : "Approved normalized alias matched.",
          },
          {
            name: "ambiguous_unique_match",
            matched: false,
            weight: -25,
            explanation:
              "More than one active entity matched the identity key.",
          },
        ],
        recommendation: "review",
        generatedBy: "deterministic",
        explanation: "Ambiguous deterministic identity match requires review.",
        operationKey: `${args.operationKey}:candidate:${candidateEntityId}`,
        createdAt: now,
      });
      candidateIds.push(candidateId);
    }
    return {
      observationId,
      resolvedEntityId: resolvedEntityId ?? null,
      candidateIds,
      duplicate: false,
    };
  },
});
