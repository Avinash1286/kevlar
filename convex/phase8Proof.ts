import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requirePhase5IngestKey } from "./phase5Auth";
import { stableHash } from "./phase6Support";
import { evaluateSemanticChange } from "./phase8Cdc";
import { deterministicEventId } from "./phase8Support";

const resultValidator = v.object({
  proofId: v.id("phase8Proofs"),
  policyIds: v.array(v.id("releasePolicies")),
  decisionIds: v.array(v.id("releaseDecisions")),
  eventIds: v.array(v.id("changeEvents")),
  conflictIds: v.array(v.id("sourceConflicts")),
  blockedDecisionIds: v.array(v.id("releaseDecisions")),
  retriedEventId: v.string(),
  duplicate: v.boolean(),
});

export const seed = mutation({
  args: { ingestKey: v.string(), operationKey: v.string() },
  returns: resultValidator,
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    const proofKey = "phase8:semantic-cdc-proof:v1";
    const existing = await ctx.db
      .query("phase8Proofs")
      .withIndex("by_key", (q) => q.eq("key", proofKey))
      .unique();
    if (existing) {
      const retriedEvent = existing.eventIds[0]
        ? await ctx.db.get("changeEvents", existing.eventIds[0])
        : null;
      if (!retriedEvent) throw new Error("Phase 8 proof lost its retry event");
      return {
        proofId: existing._id,
        policyIds: existing.policyIds,
        decisionIds: existing.decisionIds,
        eventIds: existing.eventIds,
        conflictIds: existing.conflictIds,
        blockedDecisionIds: existing.blockedDecisionIds,
        retriedEventId: retriedEvent.eventId,
        duplicate: true,
      };
    }
    if (args.operationKey.length < 1 || args.operationKey.length > 200)
      throw new Error("operationKey must contain 1-200 characters");
    const phase7Proof = await ctx.db
      .query("phase7Proofs")
      .withIndex("by_key", (q) => q.eq("key", "phase7:bitemporal-proof:v1"))
      .unique();
    if (!phase7Proof)
      throw new Error("Phase 7 proof must be seeded before Phase 8");
    const facts = (
      await Promise.all(
        phase7Proof.factVersionIds.map((id) => ctx.db.get("factVersions", id)),
      )
    ).filter((item): item is Doc<"factVersions"> => item !== null);
    const aiFacts = facts
      .filter(
        (fact) =>
          fact.entityId === phase7Proof.aiModelEntityId &&
          fact.predicate === "model.input_price_usd_per_million_tokens" &&
          fact.state === "released",
      )
      .sort((left, right) => left.transactionFrom - right.transactionFrom);
    const productFacts = facts
      .filter(
        (fact) =>
          fact.entityId === phase7Proof.productEntityId &&
          fact.predicate === "product.purchase_price.amount",
      )
      .sort((left, right) => left.transactionFrom - right.transactionFrom);
    const aiInitial = aiFacts.find((fact) => fact.changeKind === "initial");
    const aiChanged = aiFacts.find(
      (fact) => fact.changeKind === "external_change",
    );
    const productInitial = productFacts.find(
      (fact) => fact.changeKind === "initial",
    );
    const productBad = productFacts.find(
      (fact) =>
        fact.changeKind === "external_change" && fact.state === "released",
    );
    const productCorrection = productFacts.find(
      (fact) => fact.changeKind === "correction",
    );
    if (
      !aiInitial ||
      !aiChanged ||
      !productInitial ||
      !productBad ||
      !productCorrection
    )
      throw new Error(
        "Phase 7 proof does not contain the required fact history",
      );
    const [
      project,
      aiEntity,
      productEntity,
      aiChangedObservation,
      productObservation,
    ] = await Promise.all([
      ctx.db.get("projects", phase7Proof.projectId),
      ctx.db.get("canonicalEntities", phase7Proof.aiModelEntityId),
      ctx.db.get("canonicalEntities", phase7Proof.productEntityId),
      ctx.db.get("canonicalObservations", aiChanged.sourceObservationIds[0]),
      ctx.db.get("canonicalObservations", productBad.sourceObservationIds[0]),
    ]);
    if (
      !project ||
      !aiEntity ||
      !productEntity ||
      !aiChangedObservation ||
      !productObservation
    )
      throw new Error("Phase 7 proof provenance roots are missing");
    const [pricingSource, productSource, modelsSource] = await Promise.all([
      ctx.db.get("sources", aiChangedObservation.sourceId),
      ctx.db.get("sources", productObservation.sourceId),
      ctx.db
        .query("sources")
        .withIndex("by_key", (q) => q.eq("key", "openai-models"))
        .unique(),
    ]);
    if (!pricingSource || !productSource || !modelsSource)
      throw new Error("Phase 8 proof sources are missing");

    const ensureAuthority = async (input: {
      sourceId: Id<"sources">;
      predicate: string;
      suffix: string;
    }): Promise<void> => {
      const existingAuthority = await ctx.db
        .query("sourceAuthorities")
        .withIndex("by_sourceId_and_predicate", (q) =>
          q.eq("sourceId", input.sourceId).eq("predicate", input.predicate),
        )
        .unique();
      if (existingAuthority) {
        if (
          !existingAuthority.active ||
          existingAuthority.authority === "forbidden"
        )
          throw new Error("Proof source predicate authority is not active");
        return;
      }
      await ctx.db.insert("sourceAuthorities", {
        sourceId: input.sourceId,
        predicate: input.predicate,
        authority: "authoritative",
        rationale:
          "Official predicate authority for the Phase 8 semantic CDC proof.",
        active: true,
        operationKey: `${args.operationKey}:authority:${input.suffix}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    };
    await ensureAuthority({
      sourceId: pricingSource._id,
      predicate: "model.input_price_usd_per_million_tokens",
      suffix: "pricing-ai-price",
    });
    await ensureAuthority({
      sourceId: modelsSource._id,
      predicate: "model.input_price_usd_per_million_tokens",
      suffix: "models-ai-price",
    });
    await ensureAuthority({
      sourceId: productSource._id,
      predicate: "product.purchase_price.amount",
      suffix: "product-price",
    });

    const modelsBinding = await ctx.db
      .query("collectorBindings")
      .withIndex("by_sourceId_and_lifecycleStatus", (q) =>
        q.eq("sourceId", modelsSource._id).eq("lifecycleStatus", "active"),
      )
      .first();
    if (!modelsBinding?.endpointId)
      throw new Error("OpenAI models active binding is missing");
    const modelsEndpoint = await ctx.db.get(
      "sourceEndpoints",
      modelsBinding.endpointId,
    );
    if (!modelsEndpoint) throw new Error("OpenAI models endpoint is missing");
    const modelsBaseObservation = await ctx.db
      .query("canonicalObservations")
      .withIndex("by_sourceId_and_sourceEntityKey", (q) =>
        q
          .eq("sourceId", modelsSource._id)
          .eq("sourceEntityKey", "openai:gpt-4o:catalog"),
      )
      .first();
    if (!modelsBaseObservation)
      throw new Error("Phase 6 OpenAI models observation is missing");
    const modelBaseFields = await ctx.db
      .query("canonicalObservationFields")
      .withIndex("by_observationId", (q) =>
        q.eq("observationId", modelsBaseObservation._id),
      )
      .take(100);
    const modelEvidence = [
      ...new Set(modelBaseFields.flatMap((field) => field.evidenceRefs)),
    ];
    if (modelEvidence.length < 1)
      throw new Error("OpenAI models observation lacks evidence");
    let modelsPriceSpec = await ctx.db
      .query("canonicalMappingSpecs")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", `${args.operationKey}:models-price-mapping`),
      )
      .unique();
    if (!modelsPriceSpec) {
      const id = await ctx.db.insert("canonicalMappingSpecs", {
        projectId: project._id,
        sourceId: modelsSource._id,
        endpointId: modelsEndpoint._id,
        key: "openai-models-price-proof",
        name: "OpenAI models price proof",
        entityType: "ai_model",
        createdBy: "system:phase8-proof",
        operationKey: `${args.operationKey}:models-price-mapping`,
        createdAt: Date.now(),
      });
      modelsPriceSpec = await ctx.db.get("canonicalMappingSpecs", id);
    }
    if (!modelsPriceSpec)
      throw new Error("Models price mapping spec insert failed");
    let modelsPriceMapping = await ctx.db
      .query("canonicalMappingRevisions")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", `${args.operationKey}:models-price-mapping:1`),
      )
      .unique();
    if (!modelsPriceMapping) {
      const specification = {
        fields: [
          {
            source: "records[].input_price",
            target: "model.input_price_usd_per_million_tokens",
            transform: "normalize_token_price",
          },
        ],
      };
      const id = await ctx.db.insert("canonicalMappingRevisions", {
        mappingSpecId: modelsPriceSpec._id,
        revision: 1,
        sourceSchemaVersion: "phase8.proof.v1",
        canonicalSchemaRevisionId:
          modelsBaseObservation.canonicalSchemaRevisionId,
        deterministic: true,
        specification,
        specificationHash: stableHash(specification),
        createdBy: "system:phase8-proof",
        operationKey: `${args.operationKey}:models-price-mapping:1`,
        createdAt: Date.now(),
      });
      modelsPriceMapping = await ctx.db.get("canonicalMappingRevisions", id);
      await ctx.db.insert("canonicalMappingTransitions", {
        mappingSpecId: modelsPriceSpec._id,
        mappingRevisionId: id,
        fromStatus: null,
        toStatus: "active",
        actor: "system:phase8-proof",
        reason:
          "Activate the deterministic cross-source conflict proof mapping.",
        operationKey: `${args.operationKey}:models-price-mapping:active`,
        createdAt: Date.now(),
      });
    }
    if (!modelsPriceMapping)
      throw new Error("Models price mapping revision insert failed");
    const ensureModelsObservation = async (input: {
      suffix: string;
      value: number;
      state: "verified" | "quarantined";
    }): Promise<Id<"canonicalObservations">> => {
      const operationKey = `${args.operationKey}:observation:${input.suffix}`;
      const duplicate = await ctx.db
        .query("canonicalObservations")
        .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
        .unique();
      if (duplicate) return duplicate._id;
      const observationId = await ctx.db.insert("canonicalObservations", {
        projectId: project._id,
        sourceId: modelsSource._id,
        endpointId: modelsEndpoint._id,
        collectorBindingId: modelsBinding._id,
        fixtureKey: `phase8:${input.suffix}`,
        inputKind: "stored_fixture",
        mappingRevisionId: modelsPriceMapping!._id,
        canonicalSchemaRevisionId:
          modelsBaseObservation.canonicalSchemaRevisionId,
        sourceEntityKey: "openai:gpt-4o:catalog",
        entityType: "ai_model",
        resolvedEntityId: aiEntity._id,
        trustState: input.state,
        observedAt: Date.now(),
        recordedAt: Date.now(),
        payloadHash: stableHash({ value: input.value, state: input.state }),
        operationKey,
      });
      await ctx.db.insert("canonicalObservationFields", {
        observationId,
        projectId: project._id,
        canonicalPath: "model.input_price_usd_per_million_tokens",
        rawValue: `$${input.value.toFixed(2)} / 1M input tokens`,
        normalizedValue: input.value,
        normalizedValueHash: stableHash(input.value),
        unit: "usd_per_million_input_tokens",
        state: input.state,
        sourcePaths: ["records[0].input_price"],
        evidenceRefs: modelEvidence,
        transform: {
          name: "normalize_token_price",
          version: "1.0.0",
          input: `$${input.value.toFixed(2)} / 1M input tokens`,
        },
        mappingRevisionId: modelsPriceMapping!._id,
        createdAt: Date.now(),
      });
      return observationId;
    };
    const conflictingObservationId = await ensureModelsObservation({
      suffix: "official-conflict",
      value: 6,
      state: "verified",
    });
    const quarantinedObservationId = await ensureModelsObservation({
      suffix: "quarantined-price",
      value: 0.01,
      state: "quarantined",
    });

    type PolicyInput = {
      suffix: string;
      name: string;
      predicate: string;
      strategy: Doc<"releasePolicies">["strategy"];
      equivalenceRule: Doc<"releasePolicies">["equivalenceRule"];
      sources: Array<{
        sourceId: Id<"sources">;
        priority: number;
        role: Doc<"releasePolicySources">["role"];
        independenceGroup: string;
      }>;
      quorum?: number;
      tolerance?: number;
    };
    const ensurePolicy = async (
      input: PolicyInput,
    ): Promise<Id<"releasePolicies">> => {
      const operationKey = `${args.operationKey}:policy:${input.suffix}`;
      const duplicate = await ctx.db
        .query("releasePolicies")
        .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
        .unique();
      if (duplicate) return duplicate._id;
      const shape = {
        projectId: project._id,
        name: input.name,
        predicate: input.predicate,
        revision: 1,
        status: "active" as const,
        strategy: input.strategy,
        equivalenceRule: input.equivalenceRule,
        ...(input.tolerance !== undefined
          ? { numericTolerancePercent: input.tolerance }
          : {}),
        ...(input.quorum !== undefined ? { quorum: input.quorum } : {}),
        continueLastKnownGood: true,
        explicitRemovalRequired: true,
        repeatedAbsenceMinimum: 3,
      };
      const policyId = await ctx.db.insert("releasePolicies", {
        ...shape,
        policyHash: stableHash({ ...shape, sources: input.sources }),
        operationKey,
        createdAt: Date.now(),
      });
      for (const source of input.sources)
        await ctx.db.insert("releasePolicySources", {
          policyId,
          ...source,
          operationKey: `${operationKey}:source:${source.sourceId}`,
          createdAt: Date.now(),
        });
      return policyId;
    };
    const productAuthoritativePolicyId = await ensurePolicy({
      suffix: "product-authoritative",
      name: "Product price authoritative source",
      predicate: "product.purchase_price.amount",
      strategy: "authoritative",
      equivalenceRule: "numeric_tolerance",
      tolerance: 0.001,
      sources: [
        {
          sourceId: productSource._id,
          priority: 1,
          role: "authoritative",
          independenceGroup: "kevlar-fixture-lab",
        },
      ],
    });
    const aiOrderedPolicyId = await ensurePolicy({
      suffix: "ai-ordered-fallback",
      name: "AI price ordered official fallback",
      predicate: "model.input_price_usd_per_million_tokens",
      strategy: "ordered_fallback",
      equivalenceRule: "numeric_tolerance",
      tolerance: 0.001,
      sources: [
        {
          sourceId: pricingSource._id,
          priority: 1,
          role: "authoritative",
          independenceGroup: "openai-pricing-publisher",
        },
        {
          sourceId: modelsSource._id,
          priority: 2,
          role: "fallback",
          independenceGroup: "openai-models-publisher",
        },
      ],
    });
    const aiQuorumPolicyId = await ensurePolicy({
      suffix: "ai-quorum",
      name: "AI price independent quorum",
      predicate: "model.input_price_usd_per_million_tokens",
      strategy: "quorum",
      equivalenceRule: "numeric_tolerance",
      tolerance: 0.001,
      quorum: 2,
      sources: [
        {
          sourceId: pricingSource._id,
          priority: 1,
          role: "authoritative",
          independenceGroup: "openai-pricing-publisher",
        },
        {
          sourceId: modelsSource._id,
          priority: 2,
          role: "supporting",
          independenceGroup: "openai-models-publisher",
        },
      ],
    });
    const aiHumanPolicyId = await ensurePolicy({
      suffix: "ai-human-review",
      name: "AI price official conflict human review",
      predicate: "model.input_price_usd_per_million_tokens",
      strategy: "human_review",
      equivalenceRule: "numeric_tolerance",
      tolerance: 0.001,
      sources: [
        {
          sourceId: pricingSource._id,
          priority: 1,
          role: "authoritative",
          independenceGroup: "openai-pricing-publisher",
        },
        {
          sourceId: modelsSource._id,
          priority: 2,
          role: "authoritative",
          independenceGroup: "openai-models-publisher",
        },
      ],
    });
    const policyIds = [
      productAuthoritativePolicyId,
      aiOrderedPolicyId,
      aiQuorumPolicyId,
      aiHumanPolicyId,
    ];
    const aiCandidateObservationId = aiChanged.sourceObservationIds[0];
    const aiUpdate = await evaluateSemanticChange(ctx, {
      projectId: project._id,
      entityId: aiEntity._id,
      predicate: "model.input_price_usd_per_million_tokens",
      policyId: aiOrderedPolicyId,
      candidateObservationIds: [aiCandidateObservationId],
      previousFactVersionId: aiInitial._id,
      nextFactVersionId: aiChanged._id,
      intent: "auto",
      removalEvidence: "none",
      verifiedAbsenceCount: 0,
      presentationChanged: false,
      validFrom: aiChanged.validFrom,
      observedAt: aiChanged.transactionFrom,
      operationKey: `${args.operationKey}:case:ai-price-change:first`,
    });
    if (!aiUpdate.event || aiUpdate.event.eventType !== "update")
      throw new Error("AI price proof did not create an update event");
    const aiRetry = await evaluateSemanticChange(ctx, {
      projectId: project._id,
      entityId: aiEntity._id,
      predicate: "model.input_price_usd_per_million_tokens",
      policyId: aiOrderedPolicyId,
      candidateObservationIds: [aiCandidateObservationId],
      previousFactVersionId: aiInitial._id,
      nextFactVersionId: aiChanged._id,
      intent: "auto",
      removalEvidence: "none",
      verifiedAbsenceCount: 0,
      presentationChanged: false,
      validFrom: aiChanged.validFrom,
      observedAt: aiChanged.transactionFrom,
      operationKey: `${args.operationKey}:case:ai-price-change:retry`,
    });
    if (!aiRetry.duplicate || aiRetry.event?._id !== aiUpdate.event._id)
      throw new Error("AI price retry did not deduplicate to the stable event");
    const drift = await evaluateSemanticChange(ctx, {
      projectId: project._id,
      entityId: aiEntity._id,
      predicate: "model.input_price_usd_per_million_tokens",
      policyId: aiOrderedPolicyId,
      candidateObservationIds: [aiCandidateObservationId],
      previousFactVersionId: aiChanged._id,
      intent: "presentation_drift",
      removalEvidence: "none",
      verifiedAbsenceCount: 0,
      presentationChanged: true,
      observedAt: Date.now(),
      operationKey: `${args.operationKey}:case:layout-only`,
    });
    if (!drift.event || drift.event.businessEvent)
      throw new Error("Layout-only proof emitted a business event");
    const productBadObservationId = productBad.sourceObservationIds[0];
    const badProductEvent = await evaluateSemanticChange(ctx, {
      projectId: project._id,
      entityId: productEntity._id,
      predicate: "product.purchase_price.amount",
      policyId: productAuthoritativePolicyId,
      candidateObservationIds: [productBadObservationId],
      previousFactVersionId: productInitial._id,
      nextFactVersionId: productBad._id,
      intent: "auto",
      removalEvidence: "none",
      verifiedAbsenceCount: 0,
      presentationChanged: false,
      validFrom: productBad.validFrom,
      observedAt: productBad.transactionFrom,
      operationKey: `${args.operationKey}:case:product-bad-belief`,
    });
    if (!badProductEvent.event)
      throw new Error("Product bad-belief proof event is missing");
    const correctionObservationDocs = (
      await Promise.all(
        productCorrection.sourceObservationIds.map((id) =>
          ctx.db.get("canonicalObservations", id),
        ),
      )
    ).filter((item): item is Doc<"canonicalObservations"> => item !== null);
    const correctionDecisionId = await ctx.db.insert("releaseDecisions", {
      projectId: project._id,
      entityId: productEntity._id,
      predicate: "product.purchase_price.amount",
      policyId: productAuthoritativePolicyId,
      strategy: "authoritative",
      candidateObservationIds: productCorrection.sourceObservationIds,
      candidateSourceIds: correctionObservationDocs.map(
        (item) => item.sourceId,
      ),
      candidateValueHashes: [productCorrection.valueHash],
      selectedObservationIds: productCorrection.sourceObservationIds,
      selectedValueHash: productCorrection.valueHash,
      previousFactVersionId: productBad._id,
      nextFactVersionId: productCorrection._id,
      outcome: "release",
      independentGroupCount: 1,
      reasonCodes: ["extraction_error_corrected", "not_external_change"],
      details: { correctionOfEventId: badProductEvent.event.eventId },
      operationKey: `${args.operationKey}:case:product-correction:decision`,
      createdAt: Date.now(),
    });
    const correctionEventStableId = deterministicEventId({
      projectId: String(project._id),
      entityId: String(productEntity._id),
      predicate: "product.purchase_price.amount",
      previousValueHash: productBad.valueHash,
      nextValueHash: productCorrection.valueHash,
      validFrom: productCorrection.validFrom,
      eventType: "correction",
    });
    const badOriginalState = badProductEvent.event.state;
    await ctx.db.patch("changeEvents", badProductEvent.event._id, {
      state: "retracted",
    });
    await ctx.db.insert("changeEventTransitions", {
      eventId: badProductEvent.event._id,
      fromState: badOriginalState,
      toState: "retracted",
      reason: "Later evidence proved this was an extraction error.",
      operationKey: `${args.operationKey}:case:product-correction:retract-original`,
      createdAt: Date.now(),
    });
    const correctionEventId = await ctx.db.insert("changeEvents", {
      projectId: project._id,
      eventId: correctionEventStableId,
      eventType: "correction",
      state: "released",
      businessEvent: true,
      entityId: productEntity._id,
      predicate: "product.purchase_price.amount",
      releaseDecisionId: correctionDecisionId,
      previousFactVersionId: productBad._id,
      nextFactVersionId: productCorrection._id,
      previousValueHash: productBad.valueHash,
      nextValueHash: productCorrection.valueHash,
      ...(productCorrection.validFrom !== undefined
        ? { validFrom: productCorrection.validFrom }
        : {}),
      observedAt: productCorrection.transactionFrom,
      releasedAt: Date.now(),
      sourceObservationIds: productCorrection.sourceObservationIds,
      evidenceRefs: productCorrection.evidenceRefs,
      ...(productCorrection.certificateId
        ? { certificateId: productCorrection.certificateId }
        : {}),
      correctionOfEventId: badProductEvent.event.eventId,
      eventHash: stableHash({
        eventId: correctionEventStableId,
        correctionOf: badProductEvent.event.eventId,
      }),
      operationKey: `${args.operationKey}:case:product-correction:event`,
      createdAt: Date.now(),
    });
    await ctx.db.insert("changeEventTransitions", {
      eventId: correctionEventId,
      fromState: null,
      toState: "released",
      reason: "Release explicit extraction correction.",
      operationKey: `${args.operationKey}:case:product-correction:released`,
      createdAt: Date.now(),
    });
    await ctx.db.insert("changeEventRelations", {
      projectId: project._id,
      fromEventId: badProductEvent.event._id,
      toEventId: correctionEventId,
      kind: "corrects",
      reason: "Correction is distinct from a real provider price change.",
      operationKey: `${args.operationKey}:case:product-correction:relation`,
      createdAt: Date.now(),
    });
    const conflict = await evaluateSemanticChange(ctx, {
      projectId: project._id,
      entityId: aiEntity._id,
      predicate: "model.input_price_usd_per_million_tokens",
      policyId: aiHumanPolicyId,
      candidateObservationIds: [
        aiCandidateObservationId,
        conflictingObservationId,
      ],
      previousFactVersionId: aiChanged._id,
      intent: "auto",
      removalEvidence: "none",
      verifiedAbsenceCount: 0,
      presentationChanged: false,
      observedAt: Date.now(),
      operationKey: `${args.operationKey}:case:official-conflict`,
    });
    if (!conflict.conflict || conflict.conflict.status !== "open")
      throw new Error("Official source disagreement did not open a conflict");
    const quarantine = await evaluateSemanticChange(ctx, {
      projectId: project._id,
      entityId: aiEntity._id,
      predicate: "model.input_price_usd_per_million_tokens",
      policyId: aiOrderedPolicyId,
      candidateObservationIds: [quarantinedObservationId],
      previousFactVersionId: aiChanged._id,
      intent: "auto",
      removalEvidence: "none",
      verifiedAbsenceCount: 0,
      presentationChanged: false,
      observedAt: Date.now(),
      operationKey: `${args.operationKey}:case:quarantine-blocked`,
    });
    if (
      quarantine.event ||
      quarantine.decision.outcome !== "blocked_quarantine"
    )
      throw new Error("Quarantined field produced an event");
    const absence = await evaluateSemanticChange(ctx, {
      projectId: project._id,
      entityId: aiEntity._id,
      predicate: "model.input_price_usd_per_million_tokens",
      policyId: aiOrderedPolicyId,
      candidateObservationIds: [],
      previousFactVersionId: aiChanged._id,
      intent: "removal",
      removalEvidence: "none",
      verifiedAbsenceCount: 1,
      presentationChanged: false,
      observedAt: Date.now(),
      operationKey: `${args.operationKey}:case:absence-blocked`,
    });
    if (absence.event || absence.decision.outcome !== "blocked_absence")
      throw new Error("Single-source absence produced a removal event");
    const correctionEvent = await ctx.db.get("changeEvents", correctionEventId);
    if (!correctionEvent) throw new Error("Correction event insert failed");
    const decisionIds = [
      aiUpdate.decision._id,
      drift.decision._id,
      badProductEvent.decision._id,
      correctionDecisionId,
      conflict.decision._id,
    ];
    const eventIds = [
      aiUpdate.event._id,
      drift.event._id,
      badProductEvent.event._id,
      correctionEvent._id,
      conflict.event!._id,
    ];
    const blockedDecisionIds = [quarantine.decision._id, absence.decision._id];
    const proofId = await ctx.db.insert("phase8Proofs", {
      key: proofKey,
      projectId: project._id,
      entityId: aiEntity._id,
      policyIds,
      decisionIds,
      eventIds,
      conflictIds: [conflict.conflict._id],
      blockedDecisionIds,
      createdAt: Date.now(),
    });
    await ctx.db.insert("auditEvents", {
      projectId: project._id,
      actorType: "system",
      action: "phase8.proof_seeded",
      targetType: "phase8Proof",
      targetId: String(proofId),
      payload: {
        stableRetryEventId: aiUpdate.event.eventId,
        layoutBusinessEvent: drift.event.businessEvent,
        correctionEventId: correctionEvent.eventId,
        conflictId: conflict.conflict._id,
        quarantineBlocked: true,
        absenceBlocked: true,
      },
      createdAt: Date.now(),
    });
    return {
      proofId,
      policyIds,
      decisionIds,
      eventIds,
      conflictIds: [conflict.conflict._id],
      blockedDecisionIds,
      retriedEventId: aiUpdate.event.eventId,
      duplicate: false,
    };
  },
});
