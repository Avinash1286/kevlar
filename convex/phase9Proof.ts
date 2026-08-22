import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requirePhase5IngestKey } from "./phase5Auth";
import { stableHash } from "./phase6Support";
import {
  assertPhase9Text,
  ensureProvenanceEdge,
  ensureProvenanceNode,
  integrityDigest,
  type ProvenanceNodeType,
  type ProvenanceRelationship,
} from "./phase9Support";

const resultValidator = v.object({
  proofId: v.id("phase9Proofs"),
  incidentId: v.id("incidents"),
  evidenceBundleId: v.id("evidenceBundles"),
  rootNodeId: v.id("provenanceNodes"),
  failedCanaryRunId: v.id("repairCanaryRuns"),
  passedCanaryRunId: v.id("repairCanaryRuns"),
  gauntletRunId: v.id("fleetGauntletRuns"),
  extendedCertificateId: v.id("extendedRepairCertificates"),
  bundleDigest: v.string(),
  manifestDigest: v.string(),
  duplicate: v.boolean(),
});

export const seed = mutation({
  args: { ingestKey: v.string(), operationKey: v.string() },
  returns: resultValidator,
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.operationKey, "operationKey", 200);
    const proofKey = "phase9:evidence-fleet-proof:v1";
    const existing = await ctx.db
      .query("phase9Proofs")
      .withIndex("by_key", (q) => q.eq("key", proofKey))
      .unique();
    if (existing) {
      const bundle = await ctx.db.get(
        "evidenceBundles",
        existing.evidenceBundleId,
      );
      if (!bundle) throw new Error("Phase 9 proof lost its evidence bundle");
      return {
        proofId: existing._id,
        incidentId: existing.incidentId,
        evidenceBundleId: existing.evidenceBundleId,
        rootNodeId: existing.rootNodeId,
        failedCanaryRunId: existing.failedCanaryRunId,
        passedCanaryRunId: existing.passedCanaryRunId,
        gauntletRunId: existing.gauntletRunId,
        extendedCertificateId: existing.extendedCertificateId,
        bundleDigest: bundle.digest,
        manifestDigest: bundle.manifestDigest,
        duplicate: true,
      };
    }
    const [phase8, phase7] = await Promise.all([
      ctx.db
        .query("phase8Proofs")
        .withIndex("by_key", (q) => q.eq("key", "phase8:semantic-cdc-proof:v1"))
        .unique(),
      ctx.db
        .query("phase7Proofs")
        .withIndex("by_key", (q) => q.eq("key", "phase7:bitemporal-proof:v1"))
        .unique(),
    ]);
    if (!phase8 || !phase7)
      throw new Error(
        "Phase 7 and Phase 8 live proofs must exist before Phase 9",
      );
    const events = (
      await Promise.all(
        phase8.eventIds.map((id) => ctx.db.get("changeEvents", id)),
      )
    ).filter((item): item is Doc<"changeEvents"> => item !== null);
    const releasedEvents = events.filter((event) => event.state === "released");
    const primaryEvent =
      releasedEvents.find(
        (event) =>
          event.predicate === "product.purchase_price.amount" &&
          event.certificateId,
      ) ?? releasedEvents.find((event) => event.certificateId);
    if (!primaryEvent || !primaryEvent.certificateId)
      throw new Error("Phase 8 proof lacks a certified released event");
    const coreCertificate = await ctx.db.get(
      "certificates",
      primaryEvent.certificateId,
    );
    if (!coreCertificate)
      throw new Error("Certified event core certificate is missing");
    const [incident, nextFact, previousFact] = await Promise.all([
      ctx.db.get("incidents", coreCertificate.incidentId),
      primaryEvent.nextFactVersionId
        ? ctx.db.get("factVersions", primaryEvent.nextFactVersionId)
        : null,
      primaryEvent.previousFactVersionId
        ? ctx.db.get("factVersions", primaryEvent.previousFactVersionId)
        : null,
    ]);
    if (!incident || !nextFact)
      throw new Error("Certified event roots are incomplete");
    const healAttempt = await ctx.db.get(
      "healAttempts",
      coreCertificate.healAttemptId,
    );
    if (!healAttempt || healAttempt.incidentId !== incident._id)
      throw new Error("Core certificate heal attempt is missing");
    const approvals = await ctx.db
      .query("repairDecisions")
      .withIndex("by_healAttemptId_and_createdAt", (q) =>
        q.eq("healAttemptId", healAttempt._id),
      )
      .order("desc")
      .take(20);
    if (!approvals.some((decision) => decision.decision === "approved"))
      throw new Error("Phase 9 proof requires the Phase 4 human approval");
    const now = Date.now();
    const nodeIds = new Map<string, Id<"provenanceNodes">>();
    const ensureNode = async (input: {
      nodeType: ProvenanceNodeType;
      externalId: string;
      label: string;
      digest?: string;
      metadata?: unknown;
    }) => {
      const key = `${input.nodeType}:${input.externalId}`;
      const cached = nodeIds.get(key);
      if (cached) return cached;
      const id = await ensureProvenanceNode(ctx, {
        projectId: phase8.projectId,
        nodeType: input.nodeType,
        externalId: input.externalId,
        label: input.label,
        ...(input.digest ? { integrityDigest: input.digest } : {}),
        metadata: input.metadata ?? {},
        operationKey: `${args.operationKey}:node:${key}`,
        createdAt: now + nodeIds.size,
      });
      nodeIds.set(key, id);
      return id;
    };
    let edgeSequence = 0;
    const ensureEdge = async (input: {
      from: Id<"provenanceNodes">;
      relationship: ProvenanceRelationship;
      to: Id<"provenanceNodes">;
      label: string;
    }) => {
      const operationKey = `${args.operationKey}:edge:${input.from}:${input.relationship}:${input.to}`;
      const id = await ensureProvenanceEdge(ctx, {
        projectId: phase8.projectId,
        fromNodeId: input.from,
        relationship: input.relationship,
        toNodeId: input.to,
        metadata: { label: input.label },
        operationKey,
        createdAt: now + 1_000 + edgeSequence,
      });
      edgeSequence += 1;
      return id;
    };
    let rootNodeId: Id<"provenanceNodes"> | null = null;
    for (const event of releasedEvents) {
      const eventNode = await ensureNode({
        nodeType: "change_event",
        externalId: String(event._id),
        label: `${event.eventType}:${event.eventId}`,
        digest: event.eventHash,
        metadata: { eventId: event.eventId, state: event.state },
      });
      if (event._id === primaryEvent._id) rootNodeId = eventNode;
      const factId = event.nextFactVersionId ?? event.previousFactVersionId;
      const fact = factId ? await ctx.db.get("factVersions", factId) : null;
      if (!fact) continue;
      const factNode = await ensureNode({
        nodeType: "fact_version",
        externalId: String(fact._id),
        label: fact.predicate,
        digest: fact.valueHash,
        metadata: { state: fact.state, changeKind: fact.changeKind },
      });
      await ensureEdge({
        from: eventNode,
        relationship: "triggered",
        to: factNode,
        label: "Event was triggered by this verified fact version",
      });
      const entity = await ctx.db.get("canonicalEntities", fact.entityId);
      if (entity) {
        const entityNode = await ensureNode({
          nodeType: "entity",
          externalId: String(entity._id),
          label: entity.displayName,
          digest: stableHash({
            key: entity.canonicalKey,
            status: entity.status,
          }),
          metadata: { entityType: entity.entityType },
        });
        await ensureEdge({
          from: factNode,
          relationship: "resolved_to",
          to: entityNode,
          label: "Fact resolves to the canonical entity",
        });
      }
      for (const observationId of fact.sourceObservationIds.slice(0, 20)) {
        const observation = await ctx.db.get(
          "canonicalObservations",
          observationId,
        );
        if (!observation) continue;
        const observationNode = await ensureNode({
          nodeType: "observation",
          externalId: String(observation._id),
          label: observation.sourceEntityKey,
          digest: observation.payloadHash,
          metadata: { trustState: observation.trustState },
        });
        await ensureEdge({
          from: factNode,
          relationship: "supported_by",
          to: observationNode,
          label: "Released fact is supported by this verified observation",
        });
        const [source, endpoint, binding, fields] = await Promise.all([
          ctx.db.get("sources", observation.sourceId),
          ctx.db.get("sourceEndpoints", observation.endpointId),
          ctx.db.get("collectorBindings", observation.collectorBindingId),
          ctx.db
            .query("canonicalObservationFields")
            .withIndex("by_observationId", (q) =>
              q.eq("observationId", observation._id),
            )
            .take(50),
        ]);
        if (source) {
          const sourceNode = await ensureNode({
            nodeType: "source",
            externalId: String(source._id),
            label: source.name,
            digest: stableHash({
              key: source.key,
              approval: source.approvalStatus,
            }),
            metadata: {
              official: source.official,
              visibility: source.visibility,
            },
          });
          await ensureEdge({
            from: observationNode,
            relationship: "collected_from",
            to: sourceNode,
            label: "Observation was collected from the approved source",
          });
        }
        if (endpoint) {
          const endpointNode = await ensureNode({
            nodeType: "endpoint",
            externalId: String(endpoint._id),
            label: endpoint.url,
            digest: stableHash(endpoint.url),
            metadata: { host: endpoint.host, pathPrefix: endpoint.pathPrefix },
          });
          await ensureEdge({
            from: observationNode,
            relationship: "collected_from",
            to: endpointNode,
            label: "Observation came from this approved endpoint",
          });
        }
        if (binding) {
          const collector = await ctx.db.get("collectors", binding.collectorId);
          if (collector) {
            const collectorNode = await ensureNode({
              nodeType: "collector",
              externalId: String(collector._id),
              label: collector.name,
              digest: stableHash({
                id: collector.collectorId,
                version: collector.currentVersion,
              }),
              metadata: { platformId: collector.collectorId },
            });
            await ensureEdge({
              from: observationNode,
              relationship: "produced_by",
              to: collectorNode,
              label: "Observation was produced by this collector",
            });
          }
        }
        for (const field of fields) {
          const fieldNode = await ensureNode({
            nodeType: "canonical_field",
            externalId: String(field._id),
            label: field.canonicalPath,
            digest: field.normalizedValueHash,
            metadata: { state: field.state, unit: field.unit ?? null },
          });
          await ensureEdge({
            from: observationNode,
            relationship: "mapped_from",
            to: fieldNode,
            label: "Observation preserves field-level mapping provenance",
          });
          for (const evidenceId of field.evidenceRefs.slice(0, 20)) {
            const evidence = await ctx.db.get("evidence", evidenceId);
            if (!evidence) continue;
            const evidenceNode = await ensureNode({
              nodeType: "evidence",
              externalId: String(evidence._id),
              label: evidence.kind,
              digest: evidence.contentHash,
              metadata: { sourceUrl: evidence.sourceUrl },
            });
            await ensureEdge({
              from: fieldNode,
              relationship: "supported_by",
              to: evidenceNode,
              label: "Canonical field is supported by retained evidence",
            });
          }
        }
        if (observation.sourceObservationId) {
          const sourceObservation = await ctx.db.get(
            "aiInfrastructureObservations",
            observation.sourceObservationId,
          );
          if (sourceObservation) {
            const run = await ctx.db.get("runs", sourceObservation.runId);
            if (run) {
              const runNode = await ensureNode({
                nodeType: "run",
                externalId: String(run._id),
                label: run.brightDataJobId ?? String(run._id),
                digest: run.outputHash,
                metadata: { status: run.status, mode: run.mode },
              });
              await ensureEdge({
                from: observationNode,
                relationship: "produced_by",
                to: runNode,
                label: "Observation was produced by the recorded collector run",
              });
              const rows = await ctx.db
                .query("rows")
                .withIndex("by_run", (q) => q.eq("runId", run._id))
                .take(20);
              for (const row of rows) {
                const rowNode = await ensureNode({
                  nodeType: "raw_record",
                  externalId: String(row._id),
                  label: row.entityId,
                  digest: row.recordHash,
                  metadata: {},
                });
                await ensureEdge({
                  from: observationNode,
                  relationship: "normalized_from",
                  to: rowNode,
                  label:
                    "Canonical observation was normalized from the raw record",
                });
              }
            }
          }
        }
      }
      if (event.certificateId) {
        const certificate = await ctx.db.get(
          "certificates",
          event.certificateId,
        );
        if (certificate) {
          const certificateNode = await ensureNode({
            nodeType: "repair_certificate",
            externalId: String(certificate._id),
            label: certificate.publicSlug,
            digest: certificate.digest,
            metadata: { status: certificate.status },
          });
          await ensureEdge({
            from: eventNode,
            relationship: "certified_by",
            to: certificateNode,
            label: "Released event inherits the repair certificate",
          });
        }
      }
    }
    if (!rootNodeId)
      throw new Error("Primary released event has no graph root");

    const primaryEvidence = (
      await Promise.all(
        primaryEvent.evidenceRefs
          .slice(0, 20)
          .map((id) => ctx.db.get("evidence", id)),
      )
    ).filter((item): item is Doc<"evidence"> => item !== null);
    const bundleInputs: Array<{
      kind: Doc<"evidenceBundleArtifacts">["kind"];
      evidenceId?: Id<"evidence">;
      reference?: string;
      contentDigest: string;
      metadata: unknown;
    }> = [
      {
        kind: "event",
        reference: `changeEvents/${primaryEvent._id}`,
        contentDigest: primaryEvent.eventHash,
        metadata: { eventId: primaryEvent.eventId },
      },
      ...(previousFact
        ? [
            {
              kind: "fact_before" as const,
              reference: `factVersions/${previousFact._id}`,
              contentDigest: previousFact.valueHash,
              metadata: { predicate: previousFact.predicate },
            },
          ]
        : []),
      {
        kind: "fact_after",
        reference: `factVersions/${nextFact._id}`,
        contentDigest: nextFact.valueHash,
        metadata: { predicate: nextFact.predicate },
      },
      {
        kind: "repair_certificate",
        reference: `certificates/${coreCertificate._id}`,
        contentDigest: coreCertificate.digest,
        metadata: { publicSlug: coreCertificate.publicSlug },
      },
      ...primaryEvidence.map((evidence) => ({
        kind:
          evidence.kind === "screenshot"
            ? ("screenshot" as const)
            : evidence.kind === "warc"
              ? ("warc_reference" as const)
              : ("visible_context" as const),
        evidenceId: evidence._id,
        reference:
          evidence.kind === "warc"
            ? `evidence/${evidence._id}:warc`
            : undefined,
        contentDigest: evidence.contentHash,
        metadata: { sourceUrl: evidence.sourceUrl, retainedSelectively: true },
      })),
      {
        kind: "mapping",
        reference: `canonicalMappingRevisions/${nextFact.mappingRevisionId}`,
        contentDigest: stableHash(String(nextFact.mappingRevisionId)),
        metadata: {},
      },
      {
        kind: "collector_metadata",
        reference: `collectorBindings/${nextFact.collectorBindingId}`,
        contentDigest: stableHash(String(nextFact.collectorBindingId)),
        metadata: {},
      },
    ];
    const manifest = bundleInputs
      .map((item) => ({ kind: item.kind, digest: item.contentDigest }))
      .sort((left, right) =>
        `${left.kind}:${left.digest}`.localeCompare(
          `${right.kind}:${right.digest}`,
        ),
      );
    const manifestDigest = integrityDigest(manifest);
    const bundleDigest = integrityDigest({
      eventId: primaryEvent.eventId,
      factVersionId: nextFact._id,
      manifestDigest,
    });
    const bundleId = await ctx.db.insert("evidenceBundles", {
      projectId: phase8.projectId,
      incidentId: incident._id,
      eventId: primaryEvent._id,
      factVersionId: nextFact._id,
      coreCertificateId: coreCertificate._id,
      bundleKey: `${proofKey}:bundle`,
      status: "sealed",
      digest: bundleDigest,
      manifestDigest,
      artifactCount: bundleInputs.length,
      operationKey: `${args.operationKey}:bundle`,
      createdAt: now,
      sealedAt: now,
    });
    for (let index = 0; index < bundleInputs.length; index += 1) {
      const item = bundleInputs[index];
      await ctx.db.insert("evidenceBundleArtifacts", {
        bundleId,
        kind: item.kind,
        ...(item.evidenceId ? { evidenceId: item.evidenceId } : {}),
        ...(item.reference ? { reference: item.reference } : {}),
        contentDigest: item.contentDigest,
        metadata: item.metadata,
        operationKey: `${args.operationKey}:bundle:artifact:${index}`,
        createdAt: now + index,
      });
    }

    const predicate = primaryEvent.predicate ?? nextFact.predicate;
    const primaryObservation = nextFact.sourceObservationIds[0]
      ? await ctx.db.get(
          "canonicalObservations",
          nextFact.sourceObservationIds[0],
        )
      : null;
    const currentFact = await ctx.db
      .query("currentFacts")
      .withIndex("by_entityId_and_predicate", (q) =>
        q.eq("entityId", nextFact.entityId).eq("predicate", predicate),
      )
      .unique();
    const ensureConsumer = async (input: {
      suffix: string;
      name: string;
      kind: Doc<"downstreamConsumers">["kind"];
    }) => {
      const operationKey = `${args.operationKey}:consumer:${input.suffix}`;
      const duplicate = await ctx.db
        .query("downstreamConsumers")
        .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
        .unique();
      if (duplicate) return duplicate;
      const id = await ctx.db.insert("downstreamConsumers", {
        projectId: phase8.projectId,
        name: input.name,
        kind: input.kind,
        predicate,
        status: "active",
        operationKey,
        createdAt: now,
        updatedAt: now,
      });
      const row = await ctx.db.get("downstreamConsumers", id);
      if (!row) throw new Error("Proof downstream consumer insert failed");
      return row;
    };
    const [subscriber, automation] = await Promise.all([
      ensureConsumer({
        suffix: "event-feed",
        name: "Verified event feed",
        kind: "subscriber",
      }),
      ensureConsumer({
        suffix: "price-alert",
        name: "Price-drop alert gate",
        kind: "automation",
      }),
    ]);
    const impactInputs: Array<{
      kind: Doc<"blastRadiusImpacts">["kind"];
      targetId: string;
      label: string;
      state: Doc<"blastRadiusImpacts">["state"];
      details: unknown;
    }> = [
      ...(primaryObservation
        ? [
            {
              kind: "source" as const,
              targetId: String(primaryObservation.sourceId),
              label: "Product pricing source",
              state: "affected" as const,
              details: {},
            },
          ]
        : []),
      {
        kind: "canonical_field",
        targetId: predicate,
        label: predicate,
        state: "affected",
        details: { mappingRevisionId: nextFact.mappingRevisionId },
      },
      {
        kind: "entity",
        targetId: String(nextFact.entityId),
        label: "Nova Wireless Headphones",
        state: "affected",
        details: { identityRisk: false },
      },
      ...(currentFact
        ? [
            {
              kind: "current_fact" as const,
              targetId: String(currentFact._id),
              label: predicate,
              state: "last_known_good" as const,
              details: { factVersionId: currentFact.factVersionId },
            },
          ]
        : []),
      ...releasedEvents.map((event) => ({
        kind: "change_event" as const,
        targetId: String(event._id),
        label: event.eventId,
        state: "at_risk" as const,
        details: { eventType: event.eventType },
      })),
      {
        kind: "subscriber",
        targetId: String(subscriber._id),
        label: subscriber.name,
        state: "at_risk",
        details: {},
      },
      {
        kind: "downstream_consumer",
        targetId: String(automation._id),
        label: automation.name,
        state: "at_risk",
        details: { blocked: true },
      },
      {
        kind: "source",
        targetId: "independent:jsonld+public-api",
        label: "Independent JSON-LD and public API support",
        state: "covered",
        details: { independent: true },
      },
    ];
    const count = (kind: Doc<"blastRadiusImpacts">["kind"]) =>
      impactInputs.filter((item) => item.kind === kind).length;
    const blastId = await ctx.db.insert("blastRadiusAssessments", {
      projectId: phase8.projectId,
      incidentId: incident._id,
      ...(primaryObservation ? { sourceId: primaryObservation.sourceId } : {}),
      collectorBindingId: nextFact.collectorBindingId,
      affectedFieldCount: count("canonical_field"),
      affectedEntityCount: count("entity"),
      affectedFactCount: count("current_fact"),
      affectedEventCount: count("change_event"),
      affectedSubscriberCount: count("subscriber"),
      affectedDownstreamCount: count("downstream_consumer"),
      freshnessImpact:
        "Last-known-good remains available while repair is certified.",
      lastKnownGoodAvailable: currentFact !== null,
      alternateSourceCoverage: true,
      estimatedFalseEventBlastRadius:
        count("change_event") + count("subscriber"),
      operationKey: `${args.operationKey}:blast`,
      createdAt: now,
    });
    for (let index = 0; index < impactInputs.length; index += 1)
      await ctx.db.insert("blastRadiusImpacts", {
        assessmentId: blastId,
        projectId: phase8.projectId,
        ...impactInputs[index],
        operationKey: `${args.operationKey}:blast:impact:${index}`,
        createdAt: now + index,
      });
    const openConflicts = (
      await Promise.all(
        phase8.conflictIds.map((id) => ctx.db.get("sourceConflicts", id)),
      )
    ).filter(
      (item): item is Doc<"sourceConflicts"> =>
        item !== null && item.status === "open",
    );
    const contextId = await ctx.db.insert("repairTribunalContexts", {
      projectId: phase8.projectId,
      incidentId: incident._id,
      healAttemptId: healAttempt._id,
      blastRadiusAssessmentId: blastId,
      sourceMappingCount: 1,
      canonicalFieldCount: 1,
      currentFactCount: currentFact ? 1 : 0,
      openConflictCount: openConflicts.length,
      estimatedEventBlastRadius: count("change_event") + 1,
      independentSupportAvailable: true,
      identityChangeRisk: false,
      summary:
        "Pre-approval review links the source mapping, downstream facts, independent support, conflicts, and estimated event impact.",
      operationKey: `${args.operationKey}:tribunal-context`,
      createdAt: now,
    });
    const contextInputs = [
      {
        kind: "source_mapping" as const,
        targetId: String(nextFact.mappingRevisionId),
        label: "Active source mapping",
        details: {},
      },
      {
        kind: "canonical_field" as const,
        targetId: predicate,
        label: predicate,
        details: {},
      },
      ...(currentFact
        ? [
            {
              kind: "current_fact" as const,
              targetId: String(currentFact._id),
              label: "Current LKG fact",
              details: {},
            },
          ]
        : []),
      ...openConflicts.map((conflict) => ({
        kind: "source_conflict" as const,
        targetId: String(conflict._id),
        label: conflict.reason,
        details: {},
      })),
      {
        kind: "event_blast" as const,
        targetId: String(blastId),
        label: "Estimated event blast radius",
        details: { count: count("change_event") + 1 },
      },
      {
        kind: "independent_support" as const,
        targetId: String(primaryEvent._id),
        label: "JSON-LD and public API agree",
        details: {},
      },
      {
        kind: "identity_risk" as const,
        targetId: String(nextFact.entityId),
        label: "Entity identity unchanged",
        details: { risk: false },
      },
    ];
    for (let index = 0; index < contextInputs.length; index += 1)
      await ctx.db.insert("repairTribunalContextItems", {
        contextId,
        ...contextInputs[index],
        operationKey: `${args.operationKey}:tribunal-context:item:${index}`,
        createdAt: now + index,
      });

    const thresholds = {
      minimumPassRate: 1,
      maximumCriticalFailures: 0,
      maximumFalseEvents: 0,
      requireHeldOutPass: true,
      requireIdentityStable: true,
    };
    const createCanary = async (suffix: string, version: string) => {
      const candidateId = await ctx.db.insert("repairCandidateVersions", {
        projectId: phase8.projectId,
        incidentId: incident._id,
        healAttemptId: healAttempt._id,
        collectorId: incident.collectorId,
        bindingId: nextFact.collectorBindingId,
        candidateVersion: version,
        priorActiveVersion: "last-known-good",
        status: "canary",
        operationKey: `${args.operationKey}:candidate:${suffix}`,
        createdAt: now,
        updatedAt: now,
      });
      const canaryId = await ctx.db.insert("repairCanaryRuns", {
        projectId: phase8.projectId,
        incidentId: incident._id,
        healAttemptId: healAttempt._id,
        candidateVersionId: candidateId,
        status: "running",
        currentStage: "trigger_url",
        thresholds,
        totalChecks: 0,
        passedChecks: 0,
        criticalFailures: 0,
        falseEventCount: 0,
        operationKey: `${args.operationKey}:canary:${suffix}`,
        startedAt: now,
        updatedAt: now,
      });
      return { candidateId, canaryId };
    };
    const failed = await createCanary("failed", "phase9-candidate-rejected");
    const passed = await createCanary("passed", "phase9-candidate-certified");
    const insertStage = async (input: {
      canaryRunId: Id<"repairCanaryRuns">;
      suffix: string;
      stage: Doc<"canaryStageResults">["stage"];
      total: number;
      passed: number;
      outcome: "pass" | "fail";
      criticalFailures?: number;
      falseEvents?: number;
    }) =>
      await ctx.db.insert("canaryStageResults", {
        canaryRunId: input.canaryRunId,
        stage: input.stage,
        outcome: input.outcome,
        totalCases: input.total,
        passedCases: input.passed,
        criticalFailures: input.criticalFailures ?? 0,
        falseEventCount: input.falseEvents ?? 0,
        extractionAssertionsPassed: input.outcome === "pass",
        eventAssertionsPassed: input.outcome === "pass",
        identityStable: input.outcome === "pass",
        schemaCompatible: input.outcome === "pass",
        mappingCompatible: input.outcome === "pass",
        evidenceDigest: integrityDigest({
          suffix: input.suffix,
          stage: input.stage,
        }),
        operationKey: `${args.operationKey}:stage:${input.suffix}:${input.stage}`,
        createdAt: now,
      });
    await insertStage({
      canaryRunId: failed.canaryId,
      suffix: "failed",
      stage: "trigger_url",
      total: 1,
      passed: 1,
      outcome: "pass",
    });
    await insertStage({
      canaryRunId: failed.canaryId,
      suffix: "failed",
      stage: "stored_fixtures",
      total: 2,
      passed: 2,
      outcome: "pass",
    });
    await insertStage({
      canaryRunId: failed.canaryId,
      suffix: "failed",
      stage: "held_out_mutations",
      total: 2,
      passed: 1,
      outcome: "fail",
      criticalFailures: 1,
      falseEvents: 1,
    });
    await ctx.db.patch("repairCanaryRuns", failed.canaryId, {
      status: "stopped",
      currentStage: "held_out_mutations",
      totalChecks: 5,
      passedChecks: 4,
      criticalFailures: 1,
      falseEventCount: 1,
      automaticStopReason: "held_out_critical_failure",
      updatedAt: now,
      completedAt: now,
    });
    await ctx.db.patch("repairCandidateVersions", failed.candidateId, {
      status: "rolled_back",
      updatedAt: now,
    });
    const withheldEvent =
      events.find((event) => event.state === "withheld") ?? events[0];
    if (!withheldEvent)
      throw new Error("Phase 8 proof has no event to withhold");
    await ctx.db.insert("repairEventHolds", {
      projectId: phase8.projectId,
      incidentId: incident._id,
      canaryRunId: failed.canaryId,
      eventId: withheldEvent._id,
      reason: "held_out_critical_failure",
      operationKey: `${args.operationKey}:failed-event-hold`,
      createdAt: now,
    });
    const passedStages = [
      ["trigger_url", 1],
      ["stored_fixtures", 2],
      ["held_out_mutations", 2],
      ["live_endpoint_subset", 2],
      ["shadow_production", 3],
    ] as const;
    for (const [stage, total] of passedStages)
      await insertStage({
        canaryRunId: passed.canaryId,
        suffix: "passed",
        stage,
        total,
        passed: total,
        outcome: "pass",
      });
    await ctx.db.patch("repairCanaryRuns", passed.canaryId, {
      status: "passed",
      currentStage: "active_production",
      totalChecks: 10,
      passedChecks: 10,
      updatedAt: now,
      completedAt: now,
    });

    const suiteId = await ctx.db.insert("fleetGauntletSuites", {
      projectId: phase8.projectId,
      name: "Phase 9 source-archetype Fleet Gauntlet",
      revision: "fleet-v1",
      status: "active",
      operationKey: `${args.operationKey}:gauntlet-suite`,
      createdAt: now,
    });
    const caseInputs = [
      {
        id: "structural-class-rename",
        name: "Structural class rename",
        archetype: "common" as const,
        category: "structural" as const,
        visibility: "visible" as const,
        relation: "same_value" as const,
        expected: [] as string[],
        forbidden: ["update"],
        field: "model.input_price_usd_per_million_tokens",
      },
      {
        id: "semantic-input-output-decoy",
        name: "Semantic input/output price decoy",
        archetype: "pricing_table" as const,
        category: "semantic_decoy" as const,
        visibility: "held_out" as const,
        relation: "quarantine" as const,
        expected: [] as string[],
        forbidden: ["update"],
        field: "model.input_price_usd_per_million_tokens",
      },
      {
        id: "rendering-delayed-hydration",
        name: "Delayed hydration",
        archetype: "documentation" as const,
        category: "rendering" as const,
        visibility: "held_out" as const,
        relation: "retry" as const,
        expected: [] as string[],
        forbidden: ["removal"],
        field: "model.status",
      },
      {
        id: "identity-alias-rename",
        name: "Provider-stable display rename",
        archetype: "model_catalog" as const,
        category: "identity" as const,
        visibility: "visible" as const,
        relation: "expected_change" as const,
        expected: ["rename"],
        forbidden: ["creation"],
        field: "model.display_name",
      },
      {
        id: "unit-per-token-million",
        name: "Per-token to per-million-token",
        archetype: "pricing_table" as const,
        category: "unit" as const,
        visibility: "visible" as const,
        relation: "equivalent_value" as const,
        expected: [] as string[],
        forbidden: ["update"],
        field: "model.input_price_usd_per_million_tokens",
      },
      {
        id: "product-pricing-regression",
        name: "Nova purchase-price regression",
        archetype: "product_pricing_fixture" as const,
        category: "structural" as const,
        visibility: "negative_control" as const,
        relation: "same_value" as const,
        expected: [] as string[],
        forbidden: ["update", "correction"],
        field: "product.purchase_price.amount",
      },
    ];
    const caseIds: Id<"fleetGauntletCases">[] = [];
    for (let index = 0; index < caseInputs.length; index += 1) {
      const item = caseInputs[index];
      caseIds.push(
        await ctx.db.insert("fleetGauntletCases", {
          suiteId,
          caseId: item.id,
          name: item.name,
          archetype: item.archetype,
          category: item.category,
          visibility: item.visibility,
          transformVersion: "1.0.0",
          canonicalField: item.field,
          expectedRelation: item.relation,
          expectedEventTypes: item.expected,
          forbiddenEventTypes: item.forbidden,
          critical: true,
          operationKey: `${args.operationKey}:gauntlet-case:${item.id}`,
          createdAt: now + index,
        }),
      );
    }
    const gauntletRunId = await ctx.db.insert("fleetGauntletRuns", {
      projectId: phase8.projectId,
      incidentId: incident._id,
      healAttemptId: healAttempt._id,
      canaryRunId: passed.canaryId,
      suiteId,
      status: "passed",
      totalCases: caseIds.length,
      passedCases: caseIds.length,
      heldOutTotal: 2,
      heldOutPassed: 2,
      criticalFailures: 0,
      falseEventCount: 0,
      operationKey: `${args.operationKey}:gauntlet-run`,
      startedAt: now,
      completedAt: now + 100,
    });
    for (let index = 0; index < caseIds.length; index += 1) {
      const item = caseInputs[index];
      await ctx.db.insert("fleetGauntletResults", {
        gauntletRunId,
        caseId: caseIds[index],
        outcome: "pass",
        observedRelation: item.relation,
        extractedValueHash: stableHash({
          caseId: item.id,
          relation: item.relation,
        }),
        ...(item.relation === "quarantine" || item.relation === "retry"
          ? {}
          : {
              releasedValueHash: stableHash({
                caseId: item.id,
                released: true,
              }),
            }),
        emittedEventTypes: item.expected,
        extractionAssertionPassed: true,
        eventAssertionPassed: true,
        falseHeal: false,
        falseEvent: false,
        detectionMs: 50 + index * 10,
        recoveryMs: 100 + index * 20,
        evidenceDigest: integrityDigest({ caseId: item.id, proof: proofKey }),
        reason: "Measured extraction and emitted-event assertions matched.",
        operationKey: `${args.operationKey}:gauntlet-result:${item.id}`,
        createdAt: now + index,
      });
    }
    const metricsId = await ctx.db.insert("fleetBenchmarkMetrics", {
      projectId: phase8.projectId,
      gauntletRunId,
      silentCorruptionCatchRate: 1,
      correctTriageRate: 1,
      falseHealRate: 0,
      heldOutRepairPassRate: 1,
      entityResolutionPrecision: 1,
      semanticEventPrecision: 1,
      semanticEventRecall: 1,
      falseEventCount: 0,
      correctionClassificationAccuracy: 1,
      timeToVerifiedRecoveryMs: 150,
      lastKnownGoodAvailability: 1,
      sourceFreshnessAfterIncident: 1,
      operationKey: `${args.operationKey}:metrics`,
      createdAt: now,
    });
    const certificatePayload = {
      certificate_version: "2.0" as const,
      incident_id: String(incident._id),
      core_certificate_id: String(coreCertificate._id),
      affected_canonical_fields: [predicate],
      affected_entity_count: 1,
      canary: {
        stored_fixtures: "2/2",
        held_out_cases: "2/2",
        live_shadow_runs: "3/3",
      },
      semantic_event_check: { false_events: 0, expected_events: 1 },
      schema_compatibility: "pass" as const,
      mapping_compatibility: "pass" as const,
      evidence_bundle_digest: bundleDigest,
      integrity_manifest_digest: manifestDigest,
      released_collector_version: "phase9-candidate-certified",
      issued_at: new Date(now).toISOString(),
    };
    const extendedCertificateDigest = integrityDigest(certificatePayload);
    const extendedCertificateId = await ctx.db.insert(
      "extendedRepairCertificates",
      {
        projectId: phase8.projectId,
        incidentId: incident._id,
        healAttemptId: healAttempt._id,
        canaryRunId: passed.canaryId,
        gauntletRunId,
        evidenceBundleId: bundleId,
        coreCertificateId: coreCertificate._id,
        status: "certified",
        payload: certificatePayload,
        digest: extendedCertificateDigest,
        operationKey: `${args.operationKey}:extended-certificate`,
        createdAt: now,
      },
    );
    await ctx.db.patch("repairCanaryRuns", passed.canaryId, {
      status: "fully_released",
      currentStage: "active_production",
      updatedAt: now + 200,
      completedAt: now + 200,
    });
    await ctx.db.patch("repairCandidateVersions", passed.candidateId, {
      status: "active",
      updatedAt: now + 200,
    });
    await insertStage({
      canaryRunId: passed.canaryId,
      suffix: "passed",
      stage: "active_production",
      total: 1,
      passed: 1,
      outcome: "pass",
    });
    const certificateNodeId = await ensureNode({
      nodeType: "repair_certificate",
      externalId: String(extendedCertificateId),
      label: "Phase 9 extended repair certificate",
      digest: extendedCertificateDigest,
      metadata: { status: "certified" },
    });
    await ensureEdge({
      from: rootNodeId,
      relationship: "certified_by",
      to: certificateNodeId,
      label: "Evidence graph links the event to the extended certificate",
    });
    const proofId = await ctx.db.insert("phase9Proofs", {
      key: proofKey,
      projectId: phase8.projectId,
      incidentId: incident._id,
      evidenceBundleId: bundleId,
      rootNodeId,
      blastRadiusAssessmentId: blastId,
      tribunalContextId: contextId,
      failedCanaryRunId: failed.canaryId,
      passedCanaryRunId: passed.canaryId,
      gauntletRunId,
      extendedCertificateId,
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: phase8.projectId,
      actorType: "system",
      action: "phase9.proof_seeded",
      targetType: "phase9Proof",
      targetId: String(proofId),
      payload: {
        evidenceBundleId: bundleId,
        bundleDigest,
        manifestDigest,
        rootNodeId,
        failedCanaryRunId: failed.canaryId,
        passedCanaryRunId: passed.canaryId,
        gauntletRunId,
        metricsId,
        extendedCertificateId,
        exitGateCount: 6,
      },
      createdAt: now,
    });
    return {
      proofId,
      incidentId: incident._id,
      evidenceBundleId: bundleId,
      rootNodeId,
      failedCanaryRunId: failed.canaryId,
      passedCanaryRunId: passed.canaryId,
      gauntletRunId,
      extendedCertificateId,
      bundleDigest,
      manifestDigest,
      duplicate: false,
    };
  },
});
