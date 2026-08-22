import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requirePhase5IngestKey } from "./phase5Auth";
import { stableHash } from "./phase6Support";
import { chooseProjection, materializedState } from "./phase7Support";

const resultValidator = v.object({
  proofId: v.id("phase7Proofs"),
  aiModelEntityId: v.id("canonicalEntities"),
  productEntityId: v.id("canonicalEntities"),
  factVersionIds: v.array(v.id("factVersions")),
  relationIds: v.array(v.id("factVersionRelations")),
  currentFactIds: v.array(v.id("currentFacts")),
  duplicate: v.boolean(),
});

export const seed = mutation({
  args: { ingestKey: v.string(), operationKey: v.string() },
  returns: resultValidator,
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    if (args.operationKey.length < 1 || args.operationKey.length > 200)
      throw new Error("operationKey must contain 1-200 characters");
    const proofKey = "phase7:bitemporal-proof:v1";
    const existingProof = await ctx.db
      .query("phase7Proofs")
      .withIndex("by_key", (q) => q.eq("key", proofKey))
      .unique();
    if (existingProof)
      return {
        proofId: existingProof._id,
        aiModelEntityId: existingProof.aiModelEntityId,
        productEntityId: existingProof.productEntityId,
        factVersionIds: existingProof.factVersionIds,
        relationIds: existingProof.relationIds,
        currentFactIds: existingProof.currentFactIds,
        duplicate: true,
      };

    const phase6Proof = await ctx.db
      .query("phase6Proofs")
      .withIndex("by_key", (q) =>
        q.eq("key", "phase6:ai-infrastructure:identity-proof:v1"),
      )
      .unique();
    if (!phase6Proof)
      throw new Error("Phase 6 proof must be seeded before Phase 7");
    const [project, aiModelEntity] = await Promise.all([
      ctx.db.get("projects", phase6Proof.projectId),
      ctx.db.get("canonicalEntities", phase6Proof.resolvedEntityId),
    ]);
    if (!project || !aiModelEntity)
      throw new Error("Phase 6 proof references missing roots");
    const phase6Observations = (
      await Promise.all(
        phase6Proof.observationIds.map((id) =>
          ctx.db.get("canonicalObservations", id),
        ),
      )
    ).filter((item): item is Doc<"canonicalObservations"> => item !== null);
    let aiBaseObservation: Doc<"canonicalObservations"> | null = null;
    let aiBaseField: Doc<"canonicalObservationFields"> | null = null;
    for (const observation of phase6Observations) {
      const fields = await ctx.db
        .query("canonicalObservationFields")
        .withIndex("by_observationId", (q) =>
          q.eq("observationId", observation._id),
        )
        .take(100);
      const field = fields.find(
        (candidate) =>
          candidate.canonicalPath ===
            "model.input_price_usd_per_million_tokens" &&
          candidate.state === "verified",
      );
      if (field) {
        aiBaseObservation = observation;
        aiBaseField = field;
        break;
      }
    }
    if (
      !aiBaseObservation ||
      !aiBaseField ||
      aiBaseObservation.resolvedEntityId !== aiModelEntity._id ||
      aiBaseObservation.trustState !== "verified" ||
      aiBaseField.evidenceRefs.length < 1
    )
      throw new Error("Phase 6 proof lacks a verified AI model price field");

    const now = Date.now();
    const hour = 60 * 60 * 1_000;
    const day = 24 * hour;
    const aiInitialAt = now - 4 * hour;
    const aiChangeAt = now - hour;
    const productInitialAt = now - 4 * day;
    const productBadAt = now - 3 * day;
    const productCorrectionAt = now - 2 * day;
    const productWithholdAt = now - day;

    const ensureObservation = async (input: {
      operationKey: string;
      sourceId: Id<"sources">;
      endpointId: Id<"sourceEndpoints">;
      bindingId: Id<"collectorBindings">;
      mappingRevisionId: Id<"canonicalMappingRevisions">;
      schemaRevisionId: Id<"canonicalSchemaRevisions">;
      entityId: Id<"canonicalEntities">;
      sourceEntityKey: string;
      entityType: string;
      fixtureKey: string;
      predicate: string;
      rawValue: unknown;
      normalizedValue: unknown;
      unit?: string;
      evidenceRefs: Id<"evidence">[];
      observedAt: number;
      recordedAt: number;
      sourcePath: string;
      transform: string;
    }): Promise<Id<"canonicalObservations">> => {
      const duplicate = await ctx.db
        .query("canonicalObservations")
        .withIndex("by_operationKey", (q) =>
          q.eq("operationKey", input.operationKey),
        )
        .unique();
      if (duplicate) return duplicate._id;
      const observationId = await ctx.db.insert("canonicalObservations", {
        projectId: project._id,
        sourceId: input.sourceId,
        endpointId: input.endpointId,
        collectorBindingId: input.bindingId,
        fixtureKey: input.fixtureKey,
        inputKind: "stored_fixture",
        mappingRevisionId: input.mappingRevisionId,
        canonicalSchemaRevisionId: input.schemaRevisionId,
        sourceEntityKey: input.sourceEntityKey,
        entityType: input.entityType,
        resolvedEntityId: input.entityId,
        trustState: "verified",
        observedAt: input.observedAt,
        recordedAt: input.recordedAt,
        payloadHash: stableHash({
          predicate: input.predicate,
          value: input.normalizedValue,
          observedAt: input.observedAt,
        }),
        operationKey: input.operationKey,
      });
      await ctx.db.insert("canonicalObservationFields", {
        observationId,
        projectId: project._id,
        canonicalPath: input.predicate,
        rawValue: input.rawValue,
        normalizedValue: input.normalizedValue,
        normalizedValueHash: stableHash(input.normalizedValue),
        ...(input.unit ? { unit: input.unit } : {}),
        state: "verified",
        sourcePaths: [input.sourcePath],
        evidenceRefs: input.evidenceRefs,
        transform: {
          name: input.transform,
          version: "1.0.0",
          input: input.rawValue,
        },
        mappingRevisionId: input.mappingRevisionId,
        createdAt: input.recordedAt,
      });
      await ctx.db.insert("canonicalObservationResolutions", {
        projectId: project._id,
        observationId,
        entityId: input.entityId,
        method: "canonical_key",
        operationKey: `${input.operationKey}:resolution`,
        createdAt: input.recordedAt,
      });
      return observationId;
    };

    const aiChangeObservationId = await ensureObservation({
      operationKey: `${args.operationKey}:observation:ai-price-change`,
      sourceId: aiBaseObservation.sourceId,
      endpointId: aiBaseObservation.endpointId,
      bindingId: aiBaseObservation.collectorBindingId,
      mappingRevisionId: aiBaseObservation.mappingRevisionId,
      schemaRevisionId: aiBaseObservation.canonicalSchemaRevisionId,
      entityId: aiModelEntity._id,
      sourceEntityKey: aiBaseObservation.sourceEntityKey,
      entityType: aiBaseObservation.entityType,
      fixtureKey: "phase7:ai:gpt-4o:price-change",
      predicate: "model.input_price_usd_per_million_tokens",
      rawValue: "$4.00 / 1M input tokens",
      normalizedValue: 4,
      unit: "usd_per_million_input_tokens",
      evidenceRefs: aiBaseField.evidenceRefs,
      observedAt: aiChangeAt,
      recordedAt: aiChangeAt + 1_000,
      sourcePath: "records[0].input_price",
      transform: "normalize_token_price",
    });

    let productPack = await ctx.db
      .query("domainPacks")
      .withIndex("by_key", (q) => q.eq("key", "product-pricing-regression"))
      .unique();
    if (!productPack) {
      const id = await ctx.db.insert("domainPacks", {
        key: "product-pricing-regression",
        name: "Product Pricing Regression",
        version: "canonical-v1",
        status: "active",
        coreRequired: true,
        createdAt: now,
        updatedAt: now,
      });
      productPack = await ctx.db.get("domainPacks", id);
    }
    if (!productPack) throw new Error("Unable to seed product domain pack");
    let productSource = await ctx.db
      .query("sources")
      .withIndex("by_key", (q) => q.eq("key", "kevlar-product-fixture"))
      .unique();
    if (!productSource) {
      const id = await ctx.db.insert("sources", {
        domainPackId: productPack._id,
        key: "kevlar-product-fixture",
        name: "Kevlar product pricing fixture",
        sourceType: "pricing",
        providerKey: "kevlar-fixture-lab",
        visibility: "public",
        official: true,
        approvalStatus: "approved",
        lifecycleStatus: "active",
        createdAt: now,
        updatedAt: now,
      });
      productSource = await ctx.db.get("sources", id);
    }
    if (!productSource) throw new Error("Unable to seed product source");
    const productUrl =
      "https://kevlar-fixture-lab.vercel.app/product-pricing/nova";
    let productEndpoint = await ctx.db
      .query("sourceEndpoints")
      .withIndex("by_sourceId_and_url", (q) =>
        q.eq("sourceId", productSource._id).eq("url", productUrl),
      )
      .unique();
    if (!productEndpoint) {
      const id = await ctx.db.insert("sourceEndpoints", {
        sourceId: productSource._id,
        url: productUrl,
        host: "kevlar-fixture-lab.vercel.app",
        pathPrefix: "/product-pricing/nova",
        public: true,
        approvalStatus: "approved",
        createdAt: now,
        updatedAt: now,
      });
      productEndpoint = await ctx.db.get("sourceEndpoints", id);
    }
    if (!productEndpoint) throw new Error("Unable to seed product endpoint");
    const regressionBindings = await ctx.db
      .query("collectorBindings")
      .withIndex("by_bindingKind_and_updatedAt", (q) =>
        q.eq("bindingKind", "regression"),
      )
      .order("desc")
      .take(20);
    const baseRegressionBinding = regressionBindings.find(
      (binding) => binding.lifecycleStatus === "active",
    );
    if (!baseRegressionBinding)
      throw new Error("Active product regression collector binding is missing");
    let productBinding = await ctx.db
      .query("collectorBindings")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", `${args.operationKey}:product-binding`),
      )
      .unique();
    if (!productBinding) {
      const id = await ctx.db.insert("collectorBindings", {
        sourceId: productSource._id,
        endpointId: productEndpoint._id,
        collectorId: baseRegressionBinding.collectorId,
        bindingKind: "regression",
        lifecycleStatus: "active",
        coreGateStatus: "regression_only",
        bypassCore: false,
        operationKey: `${args.operationKey}:product-binding`,
        createdAt: now,
        updatedAt: now,
      });
      productBinding = await ctx.db.get("collectorBindings", id);
    }
    if (!productBinding) throw new Error("Unable to seed product binding");
    const recentRuns = await ctx.db
      .query("runs")
      .withIndex("by_collector_started", (q) =>
        q.eq("collectorId", productBinding!.collectorId),
      )
      .order("desc")
      .take(30);
    let productRun: Doc<"runs"> | null = null;
    let productRow: Doc<"rows"> | null = null;
    for (const run of recentRuns) {
      const row = await ctx.db
        .query("rows")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .first();
      if (row) {
        productRun = run;
        productRow = row;
        break;
      }
    }
    if (!productRun || !productRow)
      throw new Error(
        "Product regression history requires a persisted run row",
      );
    let productEvidence = await ctx.db
      .query("evidence")
      .withIndex("by_run", (q) => q.eq("runId", productRun!._id))
      .take(20);
    if (productEvidence.length === 0) {
      const id = await ctx.db.insert("evidence", {
        projectId: project._id,
        runId: productRun._id,
        kind: "audit",
        sourceUrl: productUrl,
        contentHash: productRun.outputHash ?? productRow.recordHash,
        metadata: {
          phase: 7,
          purpose: "product fact history backfill",
          rowId: productRow._id,
        },
        phase4OperationKey: `${args.operationKey}:product-evidence`,
        capturedAt: productRun.completedAt ?? productRun.startedAt,
      });
      const inserted = await ctx.db.get("evidence", id);
      if (inserted) productEvidence = [inserted];
    }
    const evidenceRefs = productEvidence.map((item) => item._id).slice(0, 20);

    let productSchema = await ctx.db
      .query("canonicalSchemaRevisions")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", `${args.operationKey}:product-schema:1`),
      )
      .unique();
    if (!productSchema) {
      const definition = {
        domain: "product_pricing",
        revision: 1,
        entities: {
          product: {
            identity: ["product.id"],
            fields: {
              "product.purchase_price.amount": {
                type: "number",
                unit: "USD",
                minimum: 0,
              },
            },
          },
        },
      };
      const id = await ctx.db.insert("canonicalSchemaRevisions", {
        domainPackId: productPack._id,
        domain: "product_pricing",
        revision: 1,
        definition,
        definitionHash: stableHash(definition),
        createdBy: "system:phase7-proof",
        operationKey: `${args.operationKey}:product-schema:1`,
        createdAt: now,
      });
      productSchema = await ctx.db.get("canonicalSchemaRevisions", id);
      await ctx.db.insert("canonicalSchemaRevisionStates", {
        domainPackId: productPack._id,
        schemaRevisionId: id,
        fromStatus: null,
        toStatus: "active",
        actor: "system:phase7-proof",
        reason: "Activate the product pricing backfill schema.",
        operationKey: `${args.operationKey}:product-schema-state:1:active`,
        createdAt: now,
      });
    }
    if (!productSchema) throw new Error("Unable to seed product schema");
    let productMappingSpec = await ctx.db
      .query("canonicalMappingSpecs")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", `${args.operationKey}:product-mapping`),
      )
      .unique();
    if (!productMappingSpec) {
      const id = await ctx.db.insert("canonicalMappingSpecs", {
        projectId: project._id,
        sourceId: productSource._id,
        endpointId: productEndpoint._id,
        key: "fixture-product-purchase-price",
        name: "Fixture product purchase price",
        entityType: "product",
        createdBy: "system:phase7-proof",
        operationKey: `${args.operationKey}:product-mapping`,
        createdAt: now,
      });
      productMappingSpec = await ctx.db.get("canonicalMappingSpecs", id);
    }
    if (!productMappingSpec) throw new Error("Unable to seed product mapping");
    let productMapping = await ctx.db
      .query("canonicalMappingRevisions")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", `${args.operationKey}:product-mapping:1`),
      )
      .unique();
    if (!productMapping) {
      const specification = {
        fields: [
          {
            source: "product.purchase_price.amount",
            target: "product.purchase_price.amount",
            transform: "parse_currency",
          },
        ],
        identity: { source_key: "product.id" },
      };
      const id = await ctx.db.insert("canonicalMappingRevisions", {
        mappingSpecId: productMappingSpec._id,
        revision: 1,
        sourceSchemaVersion: "kevlar-product-fixture.v1",
        canonicalSchemaRevisionId: productSchema._id,
        deterministic: true,
        specification,
        specificationHash: stableHash(specification),
        createdBy: "system:phase7-proof",
        operationKey: `${args.operationKey}:product-mapping:1`,
        createdAt: now,
      });
      productMapping = await ctx.db.get("canonicalMappingRevisions", id);
      await ctx.db.insert("canonicalMappingTransitions", {
        mappingSpecId: productMappingSpec._id,
        mappingRevisionId: id,
        fromStatus: null,
        toStatus: "active",
        actor: "system:phase7-proof",
        reason: "Activate deterministic product fixture backfill mapping.",
        operationKey: `${args.operationKey}:product-mapping-state:1:active`,
        createdAt: now,
      });
    }
    if (!productMapping)
      throw new Error("Unable to seed product mapping revision");
    let productEntity = await ctx.db
      .query("canonicalEntities")
      .withIndex("by_projectId_and_entityType_and_canonicalKey", (q) =>
        q
          .eq("projectId", project._id)
          .eq("entityType", "product")
          .eq("canonicalKey", "nova-headphones"),
      )
      .unique();
    if (!productEntity) {
      const id = await ctx.db.insert("canonicalEntities", {
        projectId: project._id,
        domainPackId: productPack._id,
        entityType: "product",
        canonicalKey: "nova-headphones",
        displayName: "Nova Wireless Headphones",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      productEntity = await ctx.db.get("canonicalEntities", id);
    }
    if (!productEntity) throw new Error("Unable to seed product entity");
    const productObservationInputs = [
      {
        suffix: "initial",
        raw: "$129.00",
        value: 129,
        observedAt: productInitialAt,
        recordedAt: productInitialAt + 1_000,
      },
      {
        suffix: "bad-extraction",
        raw: "$79.00 promotional accessory price",
        value: 79,
        observedAt: productBadAt,
        recordedAt: productBadAt + 1_000,
      },
      {
        suffix: "corrected",
        raw: "$129.00 purchase price",
        value: 129,
        observedAt: productCorrectionAt,
        recordedAt: productCorrectionAt + 1_000,
      },
    ];
    const productObservationIds: Id<"canonicalObservations">[] = [];
    for (const item of productObservationInputs)
      productObservationIds.push(
        await ensureObservation({
          operationKey: `${args.operationKey}:observation:product:${item.suffix}`,
          sourceId: productSource._id,
          endpointId: productEndpoint._id,
          bindingId: productBinding._id,
          mappingRevisionId: productMapping._id,
          schemaRevisionId: productSchema._id,
          entityId: productEntity._id,
          sourceEntityKey: "nova-headphones",
          entityType: "product",
          fixtureKey: `phase7:product:${item.suffix}`,
          predicate: "product.purchase_price.amount",
          rawValue: item.raw,
          normalizedValue: item.value,
          unit: "USD",
          evidenceRefs,
          observedAt: item.observedAt,
          recordedAt: item.recordedAt,
          sourcePath: "product.purchase_price.amount",
          transform: "parse_currency",
        }),
      );

    const ensurePolicy = async (input: {
      predicate: string;
      entityType: string;
      maxAgeMs: number;
      suffix: string;
    }): Promise<Id<"factFreshnessPolicies">> => {
      const operationKey = `${args.operationKey}:policy:${input.suffix}`;
      const duplicate = await ctx.db
        .query("factFreshnessPolicies")
        .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
        .unique();
      if (duplicate) return duplicate._id;
      return await ctx.db.insert("factFreshnessPolicies", {
        projectId: project._id,
        entityType: input.entityType,
        predicate: input.predicate,
        maxAgeMs: input.maxAgeMs,
        allowLastKnownGood: true,
        status: "active",
        operationKey,
        createdAt: now,
      });
    };
    const aiPolicyId = await ensurePolicy({
      predicate: "model.input_price_usd_per_million_tokens",
      entityType: "ai_model",
      maxAgeMs: 6 * hour,
      suffix: "ai-price",
    });
    const productPolicyId = await ensurePolicy({
      predicate: "product.purchase_price.amount",
      entityType: "product",
      maxAgeMs: 6 * hour,
      suffix: "product-price",
    });

    type FactInput = {
      suffix: string;
      entityId: Id<"canonicalEntities">;
      predicate: string;
      value: unknown;
      unit: string;
      validFrom: number;
      transactionFrom: number;
      state: Doc<"factVersions">["state"];
      changeKind: Doc<"factVersions">["changeKind"];
      outcome: Doc<"factReleaseDecisions">["outcome"];
      observations: Id<"canonicalObservations">[];
      evidence: Id<"evidence">[];
      mappingRevisionId: Id<"canonicalMappingRevisions">;
      bindingId: Id<"collectorBindings">;
      policyId: Id<"factFreshnessPolicies">;
      previousId?: Id<"factVersions">;
      runId?: Id<"runs">;
      certificateId?: Id<"certificates">;
      reasonCodes: string[];
    };
    const relationIds: Id<"factVersionRelations">[] = [];
    const ensureFact = async (
      input: FactInput,
    ): Promise<Id<"factVersions">> => {
      const operationKey = `${args.operationKey}:fact:${input.suffix}`;
      const duplicate = await ctx.db
        .query("factVersions")
        .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
        .unique();
      if (duplicate) return duplicate._id;
      const decisionId = await ctx.db.insert("factReleaseDecisions", {
        projectId: project._id,
        entityId: input.entityId,
        predicate: input.predicate,
        policyId: input.policyId,
        candidateObservationIds: input.observations,
        ...(input.previousId
          ? { previousFactVersionId: input.previousId }
          : {}),
        outcome: input.outcome,
        reasonCodes: input.reasonCodes,
        details: { proof: proofKey, changeKind: input.changeKind },
        operationKey: `${operationKey}:decision`,
        createdAt: input.transactionFrom,
      });
      const factId = await ctx.db.insert("factVersions", {
        projectId: project._id,
        entityId: input.entityId,
        predicate: input.predicate,
        value: input.value,
        valueHash: stableHash(input.value),
        unit: input.unit,
        validFrom: input.validFrom,
        validTimeSource: "source_effective_at",
        transactionFrom: input.transactionFrom,
        state: input.state,
        changeKind: input.changeKind,
        releaseDecisionId: decisionId,
        sourceObservationIds: input.observations,
        evidenceRefs: input.evidence,
        mappingRevisionId: input.mappingRevisionId,
        collectorBindingId: input.bindingId,
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.certificateId ? { certificateId: input.certificateId } : {}),
        operationKey,
        createdAt: input.transactionFrom,
      });
      if (
        input.previousId &&
        (input.state === "released" || input.state === "retracted")
      ) {
        const kind =
          input.changeKind === "correction"
            ? ("corrects" as const)
            : input.changeKind === "retraction"
              ? ("retracts" as const)
              : ("supersedes" as const);
        const relationId = await ctx.db.insert("factVersionRelations", {
          projectId: project._id,
          entityId: input.entityId,
          predicate: input.predicate,
          fromFactVersionId: input.previousId,
          toFactVersionId: factId,
          kind,
          reason:
            input.changeKind === "correction"
              ? "Correct an earlier extraction belief without asserting a provider change."
              : "Verified observation establishes a genuine external change.",
          operationKey: `${operationKey}:relation`,
          createdAt: input.transactionFrom,
        });
        relationIds.push(relationId);
      }
      return factId;
    };

    const aiBaseSourceObservation = aiBaseObservation.sourceObservationId
      ? await ctx.db.get(
          "aiInfrastructureObservations",
          aiBaseObservation.sourceObservationId,
        )
      : null;
    const aiRunId = aiBaseSourceObservation?.runId;
    const aiInitialId = await ensureFact({
      suffix: "ai-initial",
      entityId: aiModelEntity._id,
      predicate: "model.input_price_usd_per_million_tokens",
      value: 5,
      unit: "usd_per_million_input_tokens",
      validFrom: aiInitialAt,
      transactionFrom: aiInitialAt + 2_000,
      state: "released",
      changeKind: "initial",
      outcome: "release",
      observations: [aiBaseObservation._id],
      evidence: aiBaseField.evidenceRefs,
      mappingRevisionId: aiBaseObservation.mappingRevisionId,
      bindingId: aiBaseObservation.collectorBindingId,
      policyId: aiPolicyId,
      ...(aiRunId ? { runId: aiRunId } : {}),
      reasonCodes: ["verified_official_price"],
    });
    const aiChangeId = await ensureFact({
      suffix: "ai-external-change",
      entityId: aiModelEntity._id,
      predicate: "model.input_price_usd_per_million_tokens",
      value: 4,
      unit: "usd_per_million_input_tokens",
      validFrom: aiChangeAt,
      transactionFrom: aiChangeAt + 2_000,
      state: "released",
      changeKind: "external_change",
      outcome: "release",
      observations: [aiChangeObservationId],
      evidence: aiBaseField.evidenceRefs,
      mappingRevisionId: aiBaseObservation.mappingRevisionId,
      bindingId: aiBaseObservation.collectorBindingId,
      policyId: aiPolicyId,
      previousId: aiInitialId,
      ...(aiRunId ? { runId: aiRunId } : {}),
      reasonCodes: ["verified_value_changed"],
    });
    const releaseForProductRun = await ctx.db
      .query("fieldReleases")
      .withIndex("by_runId", (q) => q.eq("runId", productRun._id))
      .order("desc")
      .first();
    const productCertificate = releaseForProductRun?.certificateId
      ? await ctx.db.get("certificates", releaseForProductRun.certificateId)
      : null;
    const certificateId =
      productCertificate?.status === "certified" &&
      productCertificate.collectorId === productBinding.collectorId
        ? productCertificate._id
        : undefined;
    const productInitialId = await ensureFact({
      suffix: "product-initial",
      entityId: productEntity._id,
      predicate: "product.purchase_price.amount",
      value: 129,
      unit: "USD",
      validFrom: productInitialAt,
      transactionFrom: productInitialAt + 2_000,
      state: "released",
      changeKind: "initial",
      outcome: "release",
      observations: [productObservationIds[0]],
      evidence: evidenceRefs,
      mappingRevisionId: productMapping._id,
      bindingId: productBinding._id,
      policyId: productPolicyId,
      runId: productRun._id,
      ...(certificateId ? { certificateId } : {}),
      reasonCodes: ["verified_purchase_price"],
    });
    const productBadId = await ensureFact({
      suffix: "product-bad-belief",
      entityId: productEntity._id,
      predicate: "product.purchase_price.amount",
      value: 79,
      unit: "USD",
      validFrom: productBadAt,
      transactionFrom: productBadAt + 2_000,
      state: "released",
      changeKind: "external_change",
      outcome: "release",
      observations: [productObservationIds[1]],
      evidence: evidenceRefs,
      mappingRevisionId: productMapping._id,
      bindingId: productBinding._id,
      policyId: productPolicyId,
      previousId: productInitialId,
      runId: productRun._id,
      ...(certificateId ? { certificateId } : {}),
      reasonCodes: ["then_believed_price_change"],
    });
    const productCorrectionId = await ensureFact({
      suffix: "product-correction",
      entityId: productEntity._id,
      predicate: "product.purchase_price.amount",
      value: 129,
      unit: "USD",
      validFrom: productBadAt,
      transactionFrom: productCorrectionAt + 2_000,
      state: "released",
      changeKind: "correction",
      outcome: "release",
      observations: [productObservationIds[2]],
      evidence: evidenceRefs,
      mappingRevisionId: productMapping._id,
      bindingId: productBinding._id,
      policyId: productPolicyId,
      previousId: productBadId,
      runId: productRun._id,
      ...(certificateId ? { certificateId } : {}),
      reasonCodes: ["extraction_error_corrected", "no_external_change"],
    });
    const productWithheldId = await ensureFact({
      suffix: "product-stale-lkg",
      entityId: productEntity._id,
      predicate: "product.purchase_price.amount",
      value: 129,
      unit: "USD",
      validFrom: productWithholdAt,
      transactionFrom: productWithholdAt + 2_000,
      state: "withheld",
      changeKind: "external_change",
      outcome: "continue_last_known_good",
      observations: [productObservationIds[2]],
      evidence: evidenceRefs,
      mappingRevisionId: productMapping._id,
      bindingId: productBinding._id,
      policyId: productPolicyId,
      previousId: productCorrectionId,
      runId: productRun._id,
      ...(certificateId ? { certificateId } : {}),
      reasonCodes: ["freshness_deadline_exceeded", "continue_last_known_good"],
    });
    const factVersionIds = [
      aiInitialId,
      aiChangeId,
      productInitialId,
      productBadId,
      productCorrectionId,
      productWithheldId,
    ];
    const facts = (
      await Promise.all(
        factVersionIds.map((id) => ctx.db.get("factVersions", id)),
      )
    ).filter((item): item is Doc<"factVersions"> => item !== null);

    const ensureCurrent = async (input: {
      entityId: Id<"canonicalEntities">;
      predicate: string;
      policyId: Id<"factFreshnessPolicies">;
    }): Promise<Id<"currentFacts">> => {
      const keyFacts = facts.filter(
        (fact) =>
          fact.entityId === input.entityId &&
          fact.predicate === input.predicate,
      );
      const choice = chooseProjection(keyFacts);
      if (!choice.currentVersion || !choice.decisionVersion)
        throw new Error("Proof fact key has no materializable version");
      const currentVersion = keyFacts.find(
        (fact) => fact._id === choice.currentVersion?._id,
      );
      const policy = await ctx.db.get("factFreshnessPolicies", input.policyId);
      if (!currentVersion || !policy)
        throw new Error("Proof projection is missing its version or policy");
      const sourceObservations = (
        await Promise.all(
          currentVersion.sourceObservationIds.map((id) =>
            ctx.db.get("canonicalObservations", id),
          ),
        )
      ).filter((item): item is Doc<"canonicalObservations"> => item !== null);
      const lastVerifiedAt = Math.max(
        ...sourceObservations.map((item) => item.observedAt),
        currentVersion.transactionFrom,
      );
      const freshnessDeadline = lastVerifiedAt + policy.maxAgeMs;
      const display = materializedState({
        baseState: choice.baseState,
        freshnessDeadline,
        evaluatedAt: now,
        allowLastKnownGood: policy.allowLastKnownGood,
      });
      const existing = await ctx.db
        .query("currentFacts")
        .withIndex("by_entityId_and_predicate", (q) =>
          q.eq("entityId", input.entityId).eq("predicate", input.predicate),
        )
        .unique();
      const replacement = {
        projectId: project._id,
        entityId: input.entityId,
        predicate: input.predicate,
        factVersionId: currentVersion._id,
        releaseDecisionId: choice.decisionVersion.releaseDecisionId,
        policyId: policy._id,
        valueHash: currentVersion.valueHash,
        state: display.state,
        servingLabel: display.servingLabel,
        lastVerifiedAt,
        freshnessDeadline,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.replace("currentFacts", existing._id, replacement);
        return existing._id;
      }
      return await ctx.db.insert("currentFacts", replacement);
    };
    const currentFactIds = [
      await ensureCurrent({
        entityId: aiModelEntity._id,
        predicate: "model.input_price_usd_per_million_tokens",
        policyId: aiPolicyId,
      }),
      await ensureCurrent({
        entityId: productEntity._id,
        predicate: "product.purchase_price.amount",
        policyId: productPolicyId,
      }),
    ];
    const proofId = await ctx.db.insert("phase7Proofs", {
      key: proofKey,
      projectId: project._id,
      aiModelEntityId: aiModelEntity._id,
      productEntityId: productEntity._id,
      policyIds: [aiPolicyId, productPolicyId],
      factVersionIds,
      relationIds,
      currentFactIds,
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: project._id,
      actorType: "system",
      action: "phase7.proof_seeded",
      targetType: "phase7Proof",
      targetId: String(proofId),
      payload: {
        immutableFactVersionCount: factVersionIds.length,
        correctionFactVersionId: productCorrectionId,
        staleLastKnownGoodFactVersionId: productCorrectionId,
        withheldDecisionFactVersionId: productWithheldId,
      },
      createdAt: now,
    });
    return {
      proofId,
      aiModelEntityId: aiModelEntity._id,
      productEntityId: productEntity._id,
      factVersionIds,
      relationIds,
      currentFactIds,
      duplicate: false,
    };
  },
});
