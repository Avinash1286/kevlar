import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requirePhase5IngestKey } from "./phase5Auth";
import {
  assertPhase6Text,
  normalizeIdentity,
  stableHash,
} from "./phase6Support";

const proofResultValidator = v.object({
  proofId: v.id("phase6Proofs"),
  schemaRevisionId: v.id("canonicalSchemaRevisions"),
  draftSchemaRevisionId: v.id("canonicalSchemaRevisions"),
  compatibilityId: v.id("canonicalSchemaCompatibility"),
  mappingRevisionIds: v.array(v.id("canonicalMappingRevisions")),
  observationIds: v.array(v.id("canonicalObservations")),
  resolvedEntityId: v.id("canonicalEntities"),
  ambiguousCandidateIds: v.array(v.id("identityCandidates")),
  entityOperationIds: v.array(v.id("canonicalEntityOperations")),
  duplicate: v.boolean(),
});

export const seed = mutation({
  args: { ingestKey: v.string(), operationKey: v.string() },
  returns: proofResultValidator,
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.operationKey, "operationKey", 160);
    const proofKey = "phase6:ai-infrastructure:identity-proof:v1";
    const ensureDraftCompatibility = async (
      activeSchemaRevisionId: Id<"canonicalSchemaRevisions">,
    ) => {
      const activeRevision = await ctx.db.get(
        "canonicalSchemaRevisions",
        activeSchemaRevisionId,
      );
      if (!activeRevision || activeRevision.revision !== 1)
        throw new Error("Phase 6 proof requires immutable schema revision 1");
      const draftDefinition = {
        domain: "ai_infrastructure",
        revision: 2,
        entities: {
          ai_model: {
            identity: ["model.provider_model_id", "model.provider_id"],
            fields: {
              "model.provider_model_id": {
                type: "string",
                immutable: true,
              },
              "model.display_name": { type: "string", required: true },
              "model.status": {
                type: "enum",
                values: [
                  "preview",
                  "active",
                  "deprecated",
                  "removed",
                  "unknown",
                ],
              },
              "model.input_price_usd_per_million_tokens": {
                type: "number",
                unit: "usd_per_million_input_tokens",
                minimum: 0,
              },
              "model.region": {
                type: "string",
                required: false,
                nullable: true,
              },
            },
          },
        },
      };
      const definitionHash = stableHash(draftDefinition);
      let draftRevision = await ctx.db
        .query("canonicalSchemaRevisions")
        .withIndex("by_domainPackId_and_revision", (q) =>
          q.eq("domainPackId", activeRevision.domainPackId).eq("revision", 2),
        )
        .unique();
      if (draftRevision && draftRevision.definitionHash !== definitionHash)
        throw new Error("Immutable schema revision 2 has another definition");
      if (!draftRevision) {
        const draftSchemaRevisionId = await ctx.db.insert(
          "canonicalSchemaRevisions",
          {
            domainPackId: activeRevision.domainPackId,
            domain: activeRevision.domain,
            revision: 2,
            definition: draftDefinition,
            definitionHash,
            createdBy: "system:phase6-proof",
            operationKey: "phase6:proof:schema:2",
            createdAt: Date.now(),
          },
        );
        draftRevision = await ctx.db.get(
          "canonicalSchemaRevisions",
          draftSchemaRevisionId,
        );
      }
      if (!draftRevision) throw new Error("Unable to create schema revision 2");
      const latestDraftState = await ctx.db
        .query("canonicalSchemaRevisionStates")
        .withIndex("by_schemaRevisionId_and_createdAt", (q) =>
          q.eq("schemaRevisionId", draftRevision!._id),
        )
        .order("desc")
        .first();
      if (!latestDraftState)
        await ctx.db.insert("canonicalSchemaRevisionStates", {
          domainPackId: activeRevision.domainPackId,
          schemaRevisionId: draftRevision._id,
          fromStatus: null,
          toStatus: "draft",
          actor: "system:phase6-proof",
          reason: "Optional model.region compatibility proof",
          operationKey: "phase6:proof:schema-state:2:draft",
          createdAt: Date.now(),
        });
      else if (latestDraftState.toStatus !== "draft")
        throw new Error("Proof schema revision 2 must remain draft");
      let compatibility = await ctx.db
        .query("canonicalSchemaCompatibility")
        .withIndex("by_fromRevisionId_and_toRevisionId", (q) =>
          q
            .eq("fromRevisionId", activeRevision._id)
            .eq("toRevisionId", draftRevision!._id),
        )
        .unique();
      if (!compatibility) {
        const compatibilityId = await ctx.db.insert(
          "canonicalSchemaCompatibility",
          {
            domainPackId: activeRevision.domainPackId,
            fromRevisionId: activeRevision._id,
            toRevisionId: draftRevision._id,
            classification: "backward_compatible",
            reasons: [
              "Revision 2 adds optional nullable model.region.",
              "Revision 1 payloads remain valid without model.region.",
              "No existing field is renamed, removed, retyped, or re-unitized.",
            ],
            migration: {
              required: false,
              defaultBehavior: "model.region remains absent when not observed",
            },
            operationKey: "phase6:proof:compatibility:1-to-2",
            createdAt: Date.now(),
          },
        );
        compatibility = await ctx.db.get(
          "canonicalSchemaCompatibility",
          compatibilityId,
        );
      }
      if (!compatibility)
        throw new Error("Unable to create schema compatibility proof");
      return {
        draftSchemaRevisionId: draftRevision._id,
        compatibilityId: compatibility._id,
      };
    };
    const existingProof = await ctx.db
      .query("phase6Proofs")
      .withIndex("by_key", (q) => q.eq("key", proofKey))
      .unique();
    if (existingProof) {
      const compatibility = await ensureDraftCompatibility(
        existingProof.schemaRevisionId,
      );
      if (
        existingProof.draftSchemaRevisionId !==
          compatibility.draftSchemaRevisionId ||
        existingProof.compatibilityId !== compatibility.compatibilityId
      )
        await ctx.db.patch("phase6Proofs", existingProof._id, compatibility);
      return {
        proofId: existingProof._id,
        schemaRevisionId: existingProof.schemaRevisionId,
        ...compatibility,
        mappingRevisionIds: existingProof.mappingRevisionIds,
        observationIds: existingProof.observationIds,
        resolvedEntityId: existingProof.resolvedEntityId,
        ambiguousCandidateIds: existingProof.ambiguousCandidateIds,
        entityOperationIds: existingProof.entityOperationIds,
        duplicate: true,
      };
    }
    const [project, domainPack, pricingSource, catalogSource] =
      await Promise.all([
        ctx.db
          .query("projects")
          .withIndex("by_slug", (q) => q.eq("slug", "kevlar-core"))
          .unique(),
        ctx.db
          .query("domainPacks")
          .withIndex("by_key", (q) => q.eq("key", "ai-infrastructure"))
          .unique(),
        ctx.db
          .query("sources")
          .withIndex("by_key", (q) => q.eq("key", "openai-pricing"))
          .unique(),
        ctx.db
          .query("sources")
          .withIndex("by_key", (q) => q.eq("key", "openai-models"))
          .unique(),
      ]);
    if (!project || !domainPack || !pricingSource || !catalogSource)
      throw new Error("Phase 5 AI-infrastructure catalog must be seeded first");
    const [pricingEndpoint, catalogEndpoint] = await Promise.all([
      ctx.db
        .query("sourceEndpoints")
        .withIndex("by_sourceId_and_approvalStatus", (q) =>
          q.eq("sourceId", pricingSource._id).eq("approvalStatus", "approved"),
        )
        .first(),
      ctx.db
        .query("sourceEndpoints")
        .withIndex("by_sourceId_and_approvalStatus", (q) =>
          q.eq("sourceId", catalogSource._id).eq("approvalStatus", "approved"),
        )
        .first(),
    ]);
    if (!pricingEndpoint || !catalogEndpoint)
      throw new Error("Proof sources require approved endpoints");
    const [pricingActive, pricingOnboarding, catalogActive, catalogOnboarding] =
      await Promise.all([
        ctx.db
          .query("collectorBindings")
          .withIndex("by_sourceId_and_lifecycleStatus", (q) =>
            q.eq("sourceId", pricingSource._id).eq("lifecycleStatus", "active"),
          )
          .order("desc")
          .first(),
        ctx.db
          .query("collectorBindings")
          .withIndex("by_sourceId_and_lifecycleStatus", (q) =>
            q
              .eq("sourceId", pricingSource._id)
              .eq("lifecycleStatus", "onboarding"),
          )
          .order("desc")
          .first(),
        ctx.db
          .query("collectorBindings")
          .withIndex("by_sourceId_and_lifecycleStatus", (q) =>
            q.eq("sourceId", catalogSource._id).eq("lifecycleStatus", "active"),
          )
          .order("desc")
          .first(),
        ctx.db
          .query("collectorBindings")
          .withIndex("by_sourceId_and_lifecycleStatus", (q) =>
            q
              .eq("sourceId", catalogSource._id)
              .eq("lifecycleStatus", "onboarding"),
          )
          .order("desc")
          .first(),
      ]);
    const pricingBinding = pricingActive ?? pricingOnboarding;
    const catalogBinding = catalogActive ?? catalogOnboarding;
    if (!pricingBinding || !catalogBinding)
      throw new Error("Proof sources require collector bindings");
    const [pricingCollector, catalogCollector] = await Promise.all([
      ctx.db.get("collectors", pricingBinding.collectorId),
      ctx.db.get("collectors", catalogBinding.collectorId),
    ]);
    if (
      !pricingCollector ||
      !catalogCollector ||
      pricingCollector.projectId !== project._id ||
      catalogCollector.projectId !== project._id
    )
      throw new Error("Proof collectors must belong to Kevlar Core project");
    const now = Date.now();
    const schemaDefinition = {
      domain: "ai_infrastructure",
      revision: 1,
      entities: {
        ai_model: {
          identity: ["model.provider_model_id", "model.provider_id"],
          fields: {
            "model.provider_model_id": { type: "string", immutable: true },
            "model.display_name": { type: "string", required: true },
            "model.status": {
              type: "enum",
              values: ["preview", "active", "deprecated", "removed", "unknown"],
            },
            "model.input_price_usd_per_million_tokens": {
              type: "number",
              unit: "usd_per_million_input_tokens",
              minimum: 0,
            },
          },
        },
      },
    };
    const schemaRevisionId = await ctx.db.insert("canonicalSchemaRevisions", {
      domainPackId: domainPack._id,
      domain: "ai_infrastructure",
      revision: 1,
      definition: schemaDefinition,
      definitionHash: stableHash(schemaDefinition),
      createdBy: "system:phase6-proof",
      operationKey: `${args.operationKey}:schema:1`,
      createdAt: now,
    });
    for (const [index, transition] of [
      { from: null, to: "draft" as const },
      { from: "draft" as const, to: "canary" as const },
      { from: "canary" as const, to: "active" as const },
    ].entries())
      await ctx.db.insert("canonicalSchemaRevisionStates", {
        domainPackId: domainPack._id,
        schemaRevisionId,
        fromStatus: transition.from,
        toStatus: transition.to,
        actor: "system:phase6-proof",
        reason: "Deterministic Week 6 proof schema lifecycle",
        operationKey: `${args.operationKey}:schema-state:${index}`,
        createdAt: now + index,
      });
    const compatibility = await ensureDraftCompatibility(schemaRevisionId);

    const makeMapping = async (
      sourceId: Id<"sources">,
      endpointId: Id<"sourceEndpoints">,
      key: string,
      name: string,
      fields: Array<{ target: string; source: string; transform: string }>,
    ) => {
      const mappingSpecId = await ctx.db.insert("canonicalMappingSpecs", {
        projectId: project._id,
        sourceId,
        endpointId,
        key,
        name,
        entityType: "ai_model",
        createdBy: "system:phase6-proof",
        operationKey: `${args.operationKey}:mapping-spec:${key}`,
        createdAt: now,
      });
      const specification = {
        identity: { source_key: "records[].provider_model_id" },
        fields,
      };
      const mappingRevisionId = await ctx.db.insert(
        "canonicalMappingRevisions",
        {
          mappingSpecId,
          revision: 1,
          sourceSchemaVersion: "ai-infrastructure.source.v1",
          canonicalSchemaRevisionId: schemaRevisionId,
          deterministic: true,
          specification,
          specificationHash: stableHash(specification),
          createdBy: "system:phase6-proof",
          operationKey: `${args.operationKey}:mapping-revision:${key}:1`,
          createdAt: now,
        },
      );
      await ctx.db.insert("canonicalMappingApprovals", {
        mappingRevisionId,
        decision: "approved",
        actor: "human:phase6-proof-reviewer",
        reason: "Stored fixture parity and provenance reviewed",
        operationKey: `${args.operationKey}:mapping-approval:${key}:1`,
        createdAt: now,
      });
      const transitions = [
        { from: null, to: "draft" as const },
        { from: "draft" as const, to: "shadow" as const },
        { from: "shadow" as const, to: "canary" as const },
        { from: "canary" as const, to: "active" as const },
      ];
      for (const [index, transition] of transitions.entries())
        await ctx.db.insert("canonicalMappingTransitions", {
          mappingSpecId,
          mappingRevisionId,
          fromStatus: transition.from,
          toStatus: transition.to,
          actor: "human:phase6-proof-reviewer",
          reason: "Deterministic mapping passed stored fixture lifecycle",
          operationKey: `${args.operationKey}:mapping-state:${key}:${index}`,
          createdAt: now + index,
        });
      return mappingRevisionId;
    };
    const pricingMappingId = await makeMapping(
      pricingSource._id,
      pricingEndpoint._id,
      "openai-pricing-ai-model",
      "OpenAI pricing to canonical AI model",
      [
        {
          target: "model.provider_model_id",
          source: "records[].provider_model_id",
          transform: "normalize_identifier",
        },
        {
          target: "model.input_price_usd_per_million_tokens",
          source: "records[].input_price",
          transform: "normalize_token_price",
        },
      ],
    );
    const catalogMappingId = await makeMapping(
      catalogSource._id,
      catalogEndpoint._id,
      "openai-catalog-ai-model",
      "OpenAI catalog to canonical AI model",
      [
        {
          target: "model.provider_model_id",
          source: "records[].provider_model_id",
          transform: "normalize_identifier",
        },
        {
          target: "model.display_name",
          source: "records[].display_name",
          transform: "normalize_whitespace",
        },
        {
          target: "model.status",
          source: "records[].lifecycle_status",
          transform: "map_enum",
        },
      ],
    );

    const createEntity = async (canonicalKey: string, displayName: string) =>
      await ctx.db.insert("canonicalEntities", {
        projectId: project._id,
        domainPackId: domainPack._id,
        entityType: "ai_model",
        canonicalKey,
        displayName,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    const resolvedEntityId = await createEntity("openai:gpt-4o", "GPT-4o");
    const turboEntityId = await createEntity(
      "openai:gpt-4-turbo",
      "GPT-4 Turbo",
    );
    const legacyEntityId = await createEntity(
      "openai:gpt-4o-legacy-alias",
      "GPT-4o Legacy Alias",
    );
    for (const [sourceId, suffix] of [
      [pricingSource._id, "pricing"],
      [catalogSource._id, "catalog"],
    ] as const)
      await ctx.db.insert("canonicalExternalIds", {
        projectId: project._id,
        entityId: resolvedEntityId,
        sourceId,
        namespace: "openai.provider_model_id",
        externalId: "gpt-4o",
        normalizedExternalId: "gpt-4o",
        status: "active",
        operationKey: `${args.operationKey}:external:gpt-4o:${suffix}`,
        createdAt: now,
      });
    for (const [entityId, suffix] of [
      [resolvedEntityId, "gpt-4o"],
      [turboEntityId, "gpt-4-turbo"],
    ] as const)
      await ctx.db.insert("canonicalEntityAliases", {
        projectId: project._id,
        entityId,
        sourceId: catalogSource._id,
        aliasType: "display_name",
        value: "GPT 4",
        normalizedValue: normalizeIdentity("GPT 4"),
        status: "active",
        approvedBy: "human:phase6-proof-reviewer",
        operationKey: `${args.operationKey}:ambiguous-alias:${suffix}`,
        createdAt: now,
      });

    const makeEvidence = async (
      collectorId: Id<"collectors">,
      sourceUrl: string,
      suffix: string,
      context: string,
    ) => {
      const runId = await ctx.db.insert("runs", {
        projectId: project._id,
        collectorId,
        mode: "verification",
        mutationId: `phase6-proof:${suffix}`,
        status: "verified",
        brightDataJobId: `phase6-proof:${suffix}`,
        startedAt: now,
        completedAt: now,
        outputHash: stableHash({ suffix, context }),
        rowCount: 1,
      });
      await ctx.db.insert("rows", {
        runId,
        entityId: suffix,
        rawPayload: { context },
        normalizedPayload: { context },
        fieldTrust: { state: "verified", fixture: true },
        recordHash: stableHash(context),
      });
      return await ctx.db.insert("evidence", {
        projectId: project._id,
        runId,
        kind: "visible_context",
        sourceUrl,
        contentHash: stableHash(context),
        metadata: { context, fixture: true },
        capturedAt: now,
      });
    };
    const pricingEvidenceId = await makeEvidence(
      pricingCollector._id,
      pricingEndpoint.url,
      "pricing:gpt-4o",
      "GPT-4o input price is $5.00 per million tokens.",
    );
    const catalogEvidenceId = await makeEvidence(
      catalogCollector._id,
      catalogEndpoint.url,
      "catalog:gpt-4o",
      "GPT-4o is an active OpenAI model.",
    );

    const insertObservation = async (input: {
      sourceId: Id<"sources">;
      endpointId: Id<"sourceEndpoints">;
      bindingId: Id<"collectorBindings">;
      mappingId: Id<"canonicalMappingRevisions">;
      sourceEntityKey: string;
      fixtureKey: string;
      payload: unknown;
      resolved?: Id<"canonicalEntities">;
      trust: "verified" | "needs_review";
      fields: Array<{
        path: string;
        raw: unknown;
        normalized: unknown;
        unit?: string;
        sourcePath: string;
        evidenceId: Id<"evidence">;
        transform: string;
      }>;
    }) => {
      const observationId = await ctx.db.insert("canonicalObservations", {
        projectId: project._id,
        sourceId: input.sourceId,
        endpointId: input.endpointId,
        collectorBindingId: input.bindingId,
        fixtureKey: input.fixtureKey,
        inputKind: "stored_fixture",
        mappingRevisionId: input.mappingId,
        canonicalSchemaRevisionId: schemaRevisionId,
        sourceEntityKey: input.sourceEntityKey,
        entityType: "ai_model",
        ...(input.resolved ? { resolvedEntityId: input.resolved } : {}),
        trustState: input.trust,
        observedAt: now,
        recordedAt: now,
        payloadHash: stableHash(input.payload),
        operationKey: `${args.operationKey}:observation:${input.fixtureKey}`,
      });
      for (const field of input.fields)
        await ctx.db.insert("canonicalObservationFields", {
          observationId,
          projectId: project._id,
          canonicalPath: field.path,
          rawValue: field.raw,
          normalizedValue: field.normalized,
          normalizedValueHash: stableHash(field.normalized),
          ...(field.unit ? { unit: field.unit } : {}),
          state: input.trust === "verified" ? "verified" : "needs_review",
          sourcePaths: [field.sourcePath],
          evidenceRefs: [field.evidenceId],
          transform: {
            name: field.transform,
            version: "1.0.0",
            input: field.raw,
          },
          mappingRevisionId: input.mappingId,
          createdAt: now,
        });
      if (input.resolved)
        await ctx.db.insert("canonicalObservationResolutions", {
          projectId: project._id,
          observationId,
          entityId: input.resolved,
          method: "exact_external_id",
          operationKey: `${args.operationKey}:resolution:${input.fixtureKey}`,
          createdAt: now,
        });
      return observationId;
    };
    const pricingObservationId = await insertObservation({
      sourceId: pricingSource._id,
      endpointId: pricingEndpoint._id,
      bindingId: pricingBinding._id,
      mappingId: pricingMappingId,
      sourceEntityKey: "openai:gpt-4o:pricing",
      fixtureKey: "phase6:pricing:gpt-4o",
      payload: { provider_model_id: "gpt-4o", input_price: 5 },
      resolved: resolvedEntityId,
      trust: "verified",
      fields: [
        {
          path: "model.provider_model_id",
          raw: "gpt-4o",
          normalized: "gpt-4o",
          sourcePath: "records[0].provider_model_id",
          evidenceId: pricingEvidenceId,
          transform: "normalize_identifier",
        },
        {
          path: "model.input_price_usd_per_million_tokens",
          raw: "$5.00 / 1M input tokens",
          normalized: 5,
          unit: "usd_per_million_input_tokens",
          sourcePath: "records[0].input_price",
          evidenceId: pricingEvidenceId,
          transform: "normalize_token_price",
        },
      ],
    });
    const catalogObservationId = await insertObservation({
      sourceId: catalogSource._id,
      endpointId: catalogEndpoint._id,
      bindingId: catalogBinding._id,
      mappingId: catalogMappingId,
      sourceEntityKey: "openai:gpt-4o:catalog",
      fixtureKey: "phase6:catalog:gpt-4o",
      payload: { provider_model_id: "gpt-4o", display_name: "GPT-4o" },
      resolved: resolvedEntityId,
      trust: "verified",
      fields: [
        {
          path: "model.provider_model_id",
          raw: "gpt-4o",
          normalized: "gpt-4o",
          sourcePath: "records[0].provider_model_id",
          evidenceId: catalogEvidenceId,
          transform: "normalize_identifier",
        },
        {
          path: "model.display_name",
          raw: "GPT-4o",
          normalized: "GPT-4o",
          sourcePath: "records[0].display_name",
          evidenceId: catalogEvidenceId,
          transform: "normalize_whitespace",
        },
      ],
    });
    const ambiguousObservationId = await insertObservation({
      sourceId: catalogSource._id,
      endpointId: catalogEndpoint._id,
      bindingId: catalogBinding._id,
      mappingId: catalogMappingId,
      sourceEntityKey: "openai:gpt-4:ambiguous-alias",
      fixtureKey: "phase6:catalog:gpt-4-ambiguous",
      payload: { provider_model_id: "gpt-4", display_name: "GPT 4" },
      trust: "needs_review",
      fields: [
        {
          path: "model.display_name",
          raw: "GPT 4",
          normalized: "GPT 4",
          sourcePath: "records[1].display_name",
          evidenceId: catalogEvidenceId,
          transform: "normalize_whitespace",
        },
      ],
    });
    const ambiguousCandidateIds = [];
    for (const [entityId, score, feature] of [
      [resolvedEntityId, 55, "approved_alias:gpt-4o"],
      [turboEntityId, 50, "approved_alias:gpt-4-turbo"],
    ] as const)
      ambiguousCandidateIds.push(
        await ctx.db.insert("identityCandidates", {
          projectId: project._id,
          observationId: ambiguousObservationId,
          candidateEntityId: entityId,
          score,
          features: [
            {
              name: "approved_alias",
              matched: true,
              weight: 35,
              explanation: feature,
            },
            {
              name: "ambiguous_unique_match",
              matched: false,
              weight: -25,
              explanation: "Two approved aliases matched GPT 4.",
            },
          ],
          recommendation: "review",
          generatedBy: "deterministic",
          explanation: "Ambiguous alias is held for human identity review.",
          operationKey: `${args.operationKey}:candidate:${entityId}`,
          createdAt: now,
        }),
      );

    const mergeOperationId = await ctx.db.insert("canonicalEntityOperations", {
      projectId: project._id,
      kind: "merge",
      sourceEntityIds: [legacyEntityId],
      targetEntityIds: [resolvedEntityId],
      reason: "Proof merge of an obsolete alias entity",
      actor: "human:phase6-proof-reviewer",
      evidenceRefs: [catalogEvidenceId],
      operationKey: `${args.operationKey}:merge`,
      createdAt: now,
    });
    await ctx.db.patch("canonicalEntities", legacyEntityId, {
      status: "merged",
      mergedIntoId: resolvedEntityId,
      updatedAt: now,
    });
    const mergeLineageId = await ctx.db.insert("canonicalEntityLineage", {
      projectId: project._id,
      fromEntityId: legacyEntityId,
      toEntityId: resolvedEntityId,
      relationship: "ALIAS_OF",
      status: "active",
      operationId: mergeOperationId,
      reason: "Proof merge",
      createdAt: now,
    });
    const reverseMergeOperationId = await ctx.db.insert(
      "canonicalEntityOperations",
      {
        projectId: project._id,
        kind: "reverse_merge",
        sourceEntityIds: [resolvedEntityId],
        targetEntityIds: [legacyEntityId],
        reason: "Proof that merge reversal restores the source entity",
        actor: "human:phase6-proof-reviewer",
        evidenceRefs: [catalogEvidenceId],
        reversalOfId: mergeOperationId,
        operationKey: `${args.operationKey}:reverse-merge`,
        createdAt: now + 1,
      },
    );
    await ctx.db.patch("canonicalEntities", legacyEntityId, {
      status: "active",
      mergedIntoId: undefined,
      updatedAt: now + 1,
    });
    await ctx.db.patch("canonicalEntityLineage", mergeLineageId, {
      status: "reversed",
      reversedByOperationId: reverseMergeOperationId,
      reversedAt: now + 1,
    });
    const splitChildEntityId = await createEntity(
      "openai:gpt-4o:2024-05-13",
      "GPT-4o 2024-05-13",
    );
    const splitOperationId = await ctx.db.insert("canonicalEntityOperations", {
      projectId: project._id,
      kind: "split",
      sourceEntityIds: [resolvedEntityId],
      targetEntityIds: [splitChildEntityId],
      reason: "Proof split of a version-specific identity",
      actor: "human:phase6-proof-reviewer",
      evidenceRefs: [catalogEvidenceId],
      operationKey: `${args.operationKey}:split`,
      createdAt: now + 2,
    });
    await ctx.db.patch("canonicalEntities", resolvedEntityId, {
      status: "split",
      updatedAt: now + 2,
    });
    const splitLineageId = await ctx.db.insert("canonicalEntityLineage", {
      projectId: project._id,
      fromEntityId: splitChildEntityId,
      toEntityId: resolvedEntityId,
      relationship: "VERSION_OF",
      status: "active",
      operationId: splitOperationId,
      reason: "Proof split",
      createdAt: now + 2,
    });
    const reverseSplitOperationId = await ctx.db.insert(
      "canonicalEntityOperations",
      {
        projectId: project._id,
        kind: "reverse_split",
        sourceEntityIds: [splitChildEntityId],
        targetEntityIds: [resolvedEntityId],
        reason: "Proof that split reversal restores the source entity",
        actor: "human:phase6-proof-reviewer",
        evidenceRefs: [catalogEvidenceId],
        reversalOfId: splitOperationId,
        operationKey: `${args.operationKey}:reverse-split`,
        createdAt: now + 3,
      },
    );
    await ctx.db.patch("canonicalEntities", resolvedEntityId, {
      status: "active",
      updatedAt: now + 3,
    });
    await ctx.db.patch("canonicalEntities", splitChildEntityId, {
      status: "split",
      updatedAt: now + 3,
    });
    await ctx.db.patch("canonicalEntityLineage", splitLineageId, {
      status: "reversed",
      reversedByOperationId: reverseSplitOperationId,
      reversedAt: now + 3,
    });
    const observationIds = [
      pricingObservationId,
      catalogObservationId,
      ambiguousObservationId,
    ];
    const mappingRevisionIds = [pricingMappingId, catalogMappingId];
    const entityOperationIds = [
      mergeOperationId,
      reverseMergeOperationId,
      splitOperationId,
      reverseSplitOperationId,
    ];
    const proofId = await ctx.db.insert("phase6Proofs", {
      key: proofKey,
      projectId: project._id,
      schemaRevisionId,
      ...compatibility,
      mappingRevisionIds,
      observationIds,
      resolvedEntityId,
      ambiguousCandidateIds,
      entityOperationIds,
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: project._id,
      actorType: "system",
      actorId: "phase6-proof",
      action: "phase6.canonical_identity_proof_seeded",
      targetType: "phase6_proof",
      targetId: String(proofId),
      payload: {
        schemaRevisionId,
        mappingRevisionIds,
        observationIds,
        resolvedEntityId,
        ambiguousCandidateIds,
        entityOperationIds,
      },
      createdAt: now,
    });
    return {
      proofId,
      schemaRevisionId,
      ...compatibility,
      mappingRevisionIds,
      observationIds,
      resolvedEntityId,
      ambiguousCandidateIds,
      entityOperationIds,
      duplicate: false,
    };
  },
});
