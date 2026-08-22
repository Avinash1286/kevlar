import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { performIncidentTransition } from "./incidentStateMachine";
import { assertOperationText, requirePhase4IngestKey } from "./phase4Auth";
import { certificatePayloadValidator } from "./phase4Validators";

function purchasePriceAmount(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const observedPurchasePrice = record.observedPurchasePrice;
  if (
    typeof observedPurchasePrice === "number" &&
    Number.isFinite(observedPurchasePrice) &&
    observedPurchasePrice > 0
  )
    return observedPurchasePrice;
  const product = record.product;
  if (!product || typeof product !== "object") return null;
  const purchasePrice = (product as Record<string, unknown>).purchase_price;
  if (!purchasePrice || typeof purchasePrice !== "object") return null;
  const amount = (purchasePrice as Record<string, unknown>).amount;
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0
    ? amount
    : null;
}

export const certifyAndRelease = mutation({
  args: {
    ingestKey: v.string(),
    healAttemptId: v.id("healAttempts"),
    benchmarkRunId: v.id("benchmarkRuns"),
    candidateRunId: v.id("runs"),
    payload: certificatePayloadValidator,
    digest: v.string(),
    publicSlug: v.string(),
    entityId: v.string(),
    fieldPath: v.string(),
    observedValue: v.number(),
    currency: v.string(),
    proof: v.any(),
    evidenceIds: v.array(v.id("evidence")),
    operationKey: v.string(),
    requestHash: v.string(),
  },
  returns: v.object({
    certificateId: v.id("certificates"),
    fieldReleaseId: v.id("fieldReleases"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase4IngestKey(args.ingestKey);
    assertOperationText(args.operationKey, "operationKey");
    assertOperationText(args.requestHash, "requestHash");
    assertOperationText(args.publicSlug, "publicSlug");
    assertOperationText(args.payload.certificate_id, "certificate_id");
    if (!/^sha256:[0-9a-f]{64}$/i.test(args.digest))
      throw new Error("Certificate digest must be a sha256 digest");
    if (
      !args.payload.collector.collector_id.startsWith("c_") ||
      !/^sha256:[0-9a-f]{64}$/i.test(args.payload.repair.heal_prompt_hash) ||
      args.payload.repair.diagnosis_provider.length === 0 ||
      args.payload.repair.diagnosis_model.length === 0 ||
      !/^sha256:[0-9a-f]{64}$/i.test(
        args.payload.integrity.before_output_hash,
      ) ||
      !/^sha256:[0-9a-f]{64}$/i.test(
        args.payload.integrity.after_output_hash,
      ) ||
      Number.isNaN(Date.parse(args.payload.repair.approved_at)) ||
      Number.isNaN(Date.parse(args.payload.issued_at))
    )
      throw new Error("Certificate hashes or ISO timestamps are invalid");
    if (args.payload.integrity.certificate_digest !== args.digest)
      throw new Error("Payload digest does not match persisted digest");
    if (
      args.payload.release.status !== "certified" ||
      args.payload.release.released_value !== args.observedValue
    )
      throw new Error(
        "Certified payload release does not match candidate value",
      );
    if (args.evidenceIds.length > 20)
      throw new Error("Certificate may link at most 20 evidence items");

    const existing = await ctx.db
      .query("certificates")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (existing) {
      if (existing.requestHash !== args.requestHash)
        throw new Error(
          "Idempotency key was reused with a different certificate request",
        );
      const release = await ctx.db
        .query("fieldReleases")
        .withIndex("by_certificateId", (q) =>
          q.eq("certificateId", existing._id),
        )
        .unique();
      if (!release) throw new Error("Certified operation has no field release");
      return {
        certificateId: existing._id,
        fieldReleaseId: release._id,
        duplicate: true,
      };
    }
    const slugOwner = await ctx.db
      .query("certificates")
      .withIndex("by_publicSlug", (q) => q.eq("publicSlug", args.publicSlug))
      .unique();
    if (slugOwner) throw new Error("Certificate public slug is already in use");

    const [attempt, benchmark, candidateRun] = await Promise.all([
      ctx.db.get("healAttempts", args.healAttemptId),
      ctx.db.get("benchmarkRuns", args.benchmarkRunId),
      ctx.db.get("runs", args.candidateRunId),
    ]);
    if (!attempt || attempt.status !== "approved")
      throw new Error("Certification requires an approved heal attempt");
    if (
      !benchmark ||
      benchmark.healAttemptId !== attempt._id ||
      benchmark.baseline !== "full_kevlar" ||
      benchmark.status !== "completed"
    )
      throw new Error(
        "Certification requires a completed Full Kevlar benchmark",
      );
    if (
      !benchmark.lastKnownGoodPreserved ||
      benchmark.totalCases !== 8 ||
      benchmark.passedCases !== 8 ||
      benchmark.criticalFailures !== 0 ||
      benchmark.falseHealCount !== 0 ||
      benchmark.falseReleaseCount !== 0
    )
      throw new Error("Benchmark summary does not satisfy the release gate");
    if (
      !candidateRun ||
      candidateRun.projectId !== attempt.projectId ||
      candidateRun.collectorId !== attempt.collectorId ||
      candidateRun.status !== "verified"
    )
      throw new Error("Candidate rerun must be verified on the same collector");

    const [collector, incident, checks, results, approval] = await Promise.all([
      ctx.db.get("collectors", attempt.collectorId),
      ctx.db.get("incidents", attempt.incidentId),
      ctx.db
        .query("tribunalChecks")
        .withIndex("by_healAttemptId_and_check", (q) =>
          q.eq("healAttemptId", attempt._id),
        )
        .take(8),
      ctx.db
        .query("benchmarkCaseResults")
        .withIndex("by_benchmarkRunId_and_createdAt", (q) =>
          q.eq("benchmarkRunId", benchmark._id),
        )
        .take(16),
      ctx.db
        .query("repairDecisions")
        .withIndex("by_healAttemptId_and_createdAt", (q) =>
          q.eq("healAttemptId", attempt._id),
        )
        .order("asc")
        .first(),
    ]);
    if (!collector || !incident)
      throw new Error("Repair context is incomplete");
    if (
      !approval ||
      approval.decision !== "approved" ||
      !approval.providerApprovalRef
    )
      throw new Error(
        "Bright Data approval must be persisted before certification",
      );
    if (
      args.payload.collector.collector_id !== collector.collectorId ||
      !args.payload.collector.same_id_before_after
    )
      throw new Error(
        "Certificate must prove the same Bright Data collector ID",
      );
    const checkStatus = new Map(
      checks.map((check) => [check.check, check.status]),
    );
    if (
      checkStatus.get("preview_contract") !== "pass" ||
      checkStatus.get("evidence_support") !== "pass" ||
      checkStatus.get("human_review") !== "pass"
    )
      throw new Error("Preview, evidence, and human-review checks must pass");
    const selectorRisk = checkStatus.get("selector_risk");
    if (selectorRisk !== "pass" && selectorRisk !== "deferred")
      throw new Error("Selector risk must pass or be explicitly deferred");

    if (
      results.length !== 8 ||
      results.some(
        (result) =>
          result.outcome !== "pass" || result.falseHeal || result.falseRelease,
      )
    )
      throw new Error(
        "All measured Gauntlet cases must pass without false heal or release",
      );
    const counts = {
      visible: results.filter((result) => result.visibility === "visible")
        .length,
      heldOut: results.filter((result) => result.visibility === "held_out")
        .length,
      negative: results.filter(
        (result) => result.visibility === "negative_control",
      ).length,
    };
    if (counts.visible !== 4 || counts.heldOut !== 2 || counts.negative !== 2)
      throw new Error("Gauntlet visibility counts must be 4/2/2");
    if (args.payload.measured.gauntlet_results.length !== 8)
      throw new Error("Certificate must contain all eight measured results");
    if (
      args.payload.measured.gauntlet_results.some(
        (result) =>
          result.detectionMs < 0 ||
          (result.recoveryMs !== null && result.recoveryMs < 0) ||
          result.reason.length === 0 ||
          !/^sha256:[0-9a-f]{64}$/i.test(result.evidenceHash),
      )
    )
      throw new Error("Certificate measured result fields are invalid");
    const payloadResults = new Map(
      args.payload.measured.gauntlet_results.map((result) => [
        result.caseId,
        result,
      ]),
    );
    if (payloadResults.size !== 8)
      throw new Error("Certificate Gauntlet results must have unique case IDs");
    for (const measured of results) {
      const supplied = payloadResults.get(measured.caseId);
      if (
        !supplied ||
        supplied.visibility !== measured.visibility ||
        supplied.expectedRelation !== measured.expectedRelation ||
        supplied.outcome !== measured.outcome ||
        supplied.observedValue !== measured.observedValue ||
        supplied.releasedValue !== measured.releasedValue ||
        supplied.falseHeal !== measured.falseHeal ||
        supplied.falseRelease !== measured.falseRelease ||
        supplied.detectionMs !== measured.detectionMs ||
        supplied.recoveryMs !== (measured.recoveryMs ?? null) ||
        supplied.evidenceHash !== measured.evidenceHash ||
        supplied.reason !== measured.reason
      )
        throw new Error(
          `Certificate measured result ${measured.caseId} does not match backend evidence`,
        );
    }
    const baselineRuns = await ctx.db
      .query("benchmarkRuns")
      .withIndex("by_healAttemptId_and_startedAt", (q) =>
        q.eq("healAttemptId", attempt._id),
      )
      .order("desc")
      .take(8);
    const latestByBaseline = new Map<
      (typeof baselineRuns)[number]["baseline"],
      (typeof baselineRuns)[number]
    >();
    for (const run of baselineRuns)
      if (!latestByBaseline.has(run.baseline))
        latestByBaseline.set(run.baseline, run);
    if (
      args.payload.measured.baseline_comparison.length !== 3 ||
      new Set(
        args.payload.measured.baseline_comparison.map((item) => item.system),
      ).size !== 3 ||
      latestByBaseline.get("full_kevlar")?._id !== benchmark._id
    )
      throw new Error("Certificate requires the latest three baseline systems");
    for (const supplied of args.payload.measured.baseline_comparison) {
      const run = latestByBaseline.get(supplied.system);
      if (!run || (run.status !== "completed" && run.status !== "failed"))
        throw new Error(`Baseline ${supplied.system} is not complete`);
      const baselineResults = await ctx.db
        .query("benchmarkCaseResults")
        .withIndex("by_benchmarkRunId_and_createdAt", (q) =>
          q.eq("benchmarkRunId", run._id),
        )
        .take(16);
      const heldOut = baselineResults.filter(
        (result) => result.visibility === "held_out",
      );
      const negative = baselineResults.filter(
        (result) => result.visibility === "negative_control",
      );
      const passedCases = baselineResults.filter(
        (result) => result.outcome === "pass",
      ).length;
      const recomputed = {
        totalCases: baselineResults.length,
        passedCases,
        silentCorruptionCaught: baselineResults.filter(
          (result) => result.caseId === "M4" && result.outcome === "pass",
        ).length,
        falseHealRate:
          negative.length === 0
            ? 0
            : negative.filter((result) => result.falseHeal).length /
              negative.length,
        heldOutPassRate:
          heldOut.length === 0
            ? null
            : heldOut.filter((result) => result.outcome === "pass").length /
              heldOut.length,
        falseReleases: baselineResults.filter((result) => result.falseRelease)
          .length,
        lastKnownGoodAvailable: baselineResults.every(
          (result) => !result.falseRelease || result.releasedValue !== null,
        ),
      };
      if (
        supplied.totalCases !== recomputed.totalCases ||
        supplied.passedCases !== recomputed.passedCases ||
        supplied.silentCorruptionCaught !== recomputed.silentCorruptionCaught ||
        supplied.falseHealRate !== recomputed.falseHealRate ||
        supplied.heldOutPassRate !== recomputed.heldOutPassRate ||
        supplied.falseReleases !== recomputed.falseReleases ||
        supplied.lastKnownGoodAvailable !== recomputed.lastKnownGoodAvailable ||
        run.totalCases !== recomputed.totalCases ||
        run.passedCases !== recomputed.passedCases ||
        run.lastKnownGoodPreserved !== recomputed.lastKnownGoodAvailable
      )
        throw new Error(
          `Certificate baseline ${supplied.system} does not match backend measurements`,
        );
    }
    const post = args.payload.post_approval_checks;
    if (
      post.trigger_case !== "pass" ||
      post.visible_cases !== "4/4" ||
      post.held_out_cases !== "2/2" ||
      post.negative_controls !== "2/2"
    )
      throw new Error(
        "Certificate payload counts do not match backend measurements",
      );
    if (
      args.payload.pre_approval_checks.preview_contract !==
        checkStatus.get("preview_contract") ||
      args.payload.pre_approval_checks.evidence_support !==
        checkStatus.get("evidence_support") ||
      args.payload.pre_approval_checks.selector_risk !== selectorRisk
    )
      throw new Error(
        "Certificate payload Tribunal states do not match the release policy",
      );
    if (
      !args.payload.repair.human_approved ||
      args.payload.repair.heal_prompt_hash !== attempt.promptHash ||
      Date.parse(args.payload.repair.approved_at) < approval.createdAt ||
      Date.parse(args.payload.repair.approved_at) >
        Date.parse(args.payload.issued_at) ||
      Date.parse(args.payload.issued_at) < approval.createdAt ||
      Date.parse(args.payload.issued_at) > Date.now() + 5 * 60_000
    )
      throw new Error(
        "Certificate repair provenance does not match the approved attempt",
      );
    if (
      args.payload.incident.type !== incident.classification ||
      args.payload.incident.field !== args.fieldPath
    )
      throw new Error(
        "Certificate incident payload does not match the incident",
      );
    const [failingRun, failingRow, candidateRow] = await Promise.all([
      ctx.db.get("runs", incident.failingRunId),
      ctx.db
        .query("rows")
        .withIndex("by_run", (q) => q.eq("runId", incident.failingRunId))
        .first(),
      ctx.db
        .query("rows")
        .withIndex("by_run", (q) => q.eq("runId", candidateRun._id))
        .first(),
    ]);
    const badValue = failingRow
      ? purchasePriceAmount(failingRow.normalizedPayload)
      : null;
    const repairedValue = candidateRow
      ? purchasePriceAmount(candidateRow.normalizedPayload)
      : null;
    if (
      !failingRun?.outputHash ||
      !candidateRun.outputHash ||
      badValue === null ||
      repairedValue === null ||
      args.payload.incident.observed_bad_value !== badValue ||
      args.observedValue !== repairedValue ||
      args.payload.integrity.before_output_hash !== failingRun.outputHash ||
      args.payload.integrity.after_output_hash !== candidateRun.outputHash
    )
      throw new Error("Certificate output hashes do not match measured runs");

    for (const evidenceId of args.evidenceIds) {
      const evidence = await ctx.db.get("evidence", evidenceId);
      if (!evidence || evidence.projectId !== attempt.projectId)
        throw new Error("Certificate evidence does not belong to the project");
    }
    const now = Date.now();
    const certificateId = await ctx.db.insert("certificates", {
      projectId: attempt.projectId,
      incidentId: attempt.incidentId,
      healAttemptId: attempt._id,
      benchmarkRunId: benchmark._id,
      collectorId: attempt.collectorId,
      status: "certified",
      payload: args.payload,
      digest: args.digest,
      publicSlug: args.publicSlug,
      releasedRunId: candidateRun._id,
      operationKey: args.operationKey,
      requestHash: args.requestHash,
      createdAt: now,
    });
    const previous = await ctx.db
      .query("fieldReleases")
      .withIndex("by_projectId_and_entityId_and_fieldPath_and_updatedAt", (q) =>
        q
          .eq("projectId", attempt.projectId)
          .eq("entityId", args.entityId)
          .eq("fieldPath", args.fieldPath),
      )
      .order("desc")
      .first();
    const previousGood =
      previous?.releasedValue ?? previous?.lastKnownGoodValue;
    const fieldReleaseId = await ctx.db.insert("fieldReleases", {
      projectId: attempt.projectId,
      entityId: args.entityId,
      fieldPath: args.fieldPath,
      status: "verified",
      observedValue: args.observedValue,
      releasedValue: args.observedValue,
      ...(previousGood === undefined || previousGood === null
        ? {}
        : { lastKnownGoodValue: previousGood }),
      currency: args.currency,
      runId: candidateRun._id,
      proof: {
        certificateId,
        certificateDigest: args.digest,
        measuredProof: args.proof,
      },
      certificateId,
      certifiedAt: now,
      updatedAt: now,
    });
    for (const evidenceId of args.evidenceIds)
      await ctx.db.insert("phase4EvidenceLinks", {
        projectId: attempt.projectId,
        incidentId: attempt.incidentId,
        healAttemptId: attempt._id,
        benchmarkRunId: benchmark._id,
        certificateId,
        evidenceId,
        relation: "certificate",
        operationKey: `${args.operationKey}:evidence:${evidenceId}`,
        createdAt: now,
      });

    let state = incident.state;
    if (state === "approved") {
      await performIncidentTransition(ctx, {
        incidentId: incident._id,
        toState: "certifying",
        reason: "Full Kevlar certification gate started",
        actorType: "system",
        idempotencyKey: `${args.operationKey}:certifying`,
        requestHash: args.requestHash,
        details: { benchmarkRunId: benchmark._id },
        now,
      });
      state = "certifying";
    }
    if (state !== "certifying")
      throw new Error(`Incident cannot certify from state ${state}`);
    await performIncidentTransition(ctx, {
      incidentId: incident._id,
      toState: "resolved",
      reason: "Repair certified and verified field released",
      actorType: "system",
      idempotencyKey: `${args.operationKey}:resolved`,
      requestHash: args.requestHash,
      details: { certificateId, fieldReleaseId },
      now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: attempt.projectId,
      actorType: "system",
      action: "certificate.certified_and_released",
      targetType: "certificate",
      targetId: String(certificateId),
      payload: { digest: args.digest, fieldReleaseId, sameCollectorId: true },
      createdAt: now,
    });
    return { certificateId, fieldReleaseId, duplicate: false };
  },
});

export const rejectCertification = mutation({
  args: {
    ingestKey: v.string(),
    healAttemptId: v.id("healAttempts"),
    benchmarkRunId: v.id("benchmarkRuns"),
    reason: v.string(),
    operationKey: v.string(),
    requestHash: v.string(),
  },
  returns: v.object({
    incidentId: v.id("incidents"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase4IngestKey(args.ingestKey);
    assertOperationText(args.operationKey, "operationKey");
    assertOperationText(args.requestHash, "requestHash");
    if (args.reason.length === 0 || args.reason.length > 1_000)
      throw new Error("Rejection reason must contain 1-1000 characters");
    const existing = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (existing) {
      if (existing.requestHash !== args.requestHash)
        throw new Error(
          "Idempotency key was reused with a different rejection request",
        );
      const attempt = await ctx.db.get("healAttempts", args.healAttemptId);
      if (!attempt) throw new Error("Heal attempt not found");
      return { incidentId: attempt.incidentId, duplicate: true };
    }
    const [attempt, benchmark] = await Promise.all([
      ctx.db.get("healAttempts", args.healAttemptId),
      ctx.db.get("benchmarkRuns", args.benchmarkRunId),
    ]);
    if (
      !attempt ||
      attempt.status !== "approved" ||
      !benchmark ||
      benchmark.healAttemptId !== attempt._id ||
      (benchmark.status !== "completed" && benchmark.status !== "failed")
    )
      throw new Error("Rejected certification context is invalid");
    if (
      benchmark.status === "completed" &&
      benchmark.totalCases === 8 &&
      benchmark.passedCases === 8 &&
      benchmark.criticalFailures === 0 &&
      benchmark.falseHealCount === 0 &&
      benchmark.falseReleaseCount === 0 &&
      benchmark.lastKnownGoodPreserved
    )
      throw new Error("A passing certification gate cannot be rejected");
    const incident = await ctx.db.get("incidents", attempt.incidentId);
    if (!incident) throw new Error("Incident not found");
    const now = Date.now();
    await ctx.db.insert("idempotencyRecords", {
      projectId: attempt.projectId,
      incidentId: attempt.incidentId,
      operationKey: args.operationKey,
      scope: "workflow",
      status: "completed",
      requestHash: args.requestHash,
      result: { benchmarkRunId: benchmark._id, rejected: true },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    let state = incident.state;
    if (state === "approved") {
      await performIncidentTransition(ctx, {
        incidentId: incident._id,
        toState: "certifying",
        reason: "Certification results evaluated",
        actorType: "system",
        idempotencyKey: `${args.operationKey}:certifying`,
        requestHash: args.requestHash,
        details: { benchmarkRunId: benchmark._id, reason: args.reason },
        now,
      });
      state = "certifying";
    }
    if (state === "certifying")
      await performIncidentTransition(ctx, {
        incidentId: incident._id,
        toState: "quarantined",
        reason: "Certification failed; last-known-good remains active",
        actorType: "system",
        idempotencyKey: `${args.operationKey}:quarantined`,
        requestHash: args.requestHash,
        details: { benchmarkRunId: benchmark._id, reason: args.reason },
        now,
      });
    await ctx.db.insert("auditEvents", {
      projectId: attempt.projectId,
      actorType: "system",
      action: "certification.rejected_lkg_preserved",
      targetType: "benchmark_run",
      targetId: String(benchmark._id),
      payload: { reason: args.reason, released: false },
      createdAt: now,
    });
    return { incidentId: incident._id, duplicate: false };
  },
});
