import { sha256 } from "@kevlar/hashing";

export type EntityLifecycle =
  "preview" | "active" | "deprecated" | "retired" | "unknown";

export type CanonicalIdentity = {
  entityId: string;
  entityType: string;
  providerId: string;
  providerModelId?: string;
  canonicalKey: string;
  displayName: string;
  family?: string;
  version?: string;
  lifecycle: EntityLifecycle;
  externalIds: string[];
  aliases: string[];
};

export type IdentityCandidateInput = Omit<
  CanonicalIdentity,
  "entityId" | "externalIds" | "aliases"
> & {
  externalIds?: string[];
  candidateSource: "deterministic" | "ai_suggestion";
  criticalFactConflict?: boolean;
};

export type IdentityScoreFeature = {
  name: string;
  score: number;
  detail: string;
};

export type IdentityResolution = {
  decision: "auto_link" | "needs_review" | "create_new" | "rejected";
  entityId?: string;
  score: number;
  features: IdentityScoreFeature[];
  reason: string;
};

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function explicitVersion(value: string | undefined) {
  return value?.match(
    /(?:19|20)\d{2}(?:[-_]?(?:0[1-9]|1[0-2])(?:[-_]?(?:0[1-9]|[12]\d|3[01]))?)?/,
  )?.[0];
}

function scoreCandidate(
  input: IdentityCandidateInput,
  entity: CanonicalIdentity,
) {
  const features: IdentityScoreFeature[] = [];
  const add = (name: string, score: number, detail: string) =>
    features.push({ name, score, detail });
  if (input.providerId === entity.providerId)
    add("exact_provider_id", 40, input.providerId);
  else
    add(
      "conflicting_provider",
      -100,
      `${input.providerId} != ${entity.providerId}`,
    );

  if (
    input.providerModelId &&
    input.providerModelId === entity.providerModelId
  ) {
    add("exact_provider_model_id", 40, input.providerModelId);
  }
  if (input.externalIds?.some((id) => entity.externalIds.includes(id))) {
    add("exact_external_id", 40, "Approved external identifier matched.");
  }
  if (entity.aliases.map(normalize).includes(normalize(input.canonicalKey))) {
    add("approved_alias", 35, input.canonicalKey);
  }
  if (normalize(input.displayName) === normalize(entity.displayName)) {
    add("exact_normalized_display_name", 20, input.displayName);
  }
  if (
    input.family &&
    entity.family &&
    normalize(input.family) === normalize(entity.family)
  ) {
    add("same_model_family", 15, input.family);
  }
  const inputVersion = explicitVersion(input.version ?? input.providerModelId);
  const entityVersion = explicitVersion(
    entity.version ?? entity.providerModelId,
  );
  if (inputVersion && entityVersion) {
    add(
      inputVersion === entityVersion
        ? "same_version_token"
        : "conflicting_explicit_version",
      inputVersion === entityVersion ? 15 : -60,
      `${inputVersion}/${entityVersion}`,
    );
  }
  if (input.criticalFactConflict)
    add("critical_fact_disagreement", -20, "Critical facts disagree.");
  if (
    input.lifecycle === "active" &&
    entity.lifecycle === "retired" &&
    inputVersion &&
    entityVersion &&
    inputVersion === entityVersion
  ) {
    add("incompatible_lifecycle", -40, "Active and retired lifecycle overlap.");
  }
  return {
    features,
    score: features.reduce((total, feature) => total + feature.score, 0),
  };
}

export function resolveIdentity(
  input: IdentityCandidateInput,
  entities: CanonicalIdentity[],
): IdentityResolution {
  if (input.candidateSource === "ai_suggestion") {
    return {
      decision: "needs_review",
      score: 0,
      features: [
        {
          name: "ai_generated_candidate",
          score: 0,
          detail: "AI candidates never auto-link.",
        },
      ],
      reason:
        "Candidate was produced by AI and requires explicit human review.",
    };
  }

  const ranked = entities
    .map((entity) => ({ entity, ...scoreCandidate(input, entity) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score <= 0) {
    return {
      decision: "create_new",
      score: best?.score ?? 0,
      features: best?.features ?? [],
      reason: "No viable identity candidate.",
    };
  }
  if (
    best.features.some(
      (feature) =>
        feature.name === "conflicting_provider" ||
        feature.name === "conflicting_explicit_version",
    )
  ) {
    return {
      decision: "rejected",
      score: best.score,
      features: best.features,
      reason: "Deterministic identity constraints conflict.",
    };
  }

  const exactCanonicalKey = input.canonicalKey === best.entity.canonicalKey;
  const exactExternalId = best.features.some(
    (feature) => feature.name === "exact_external_id",
  );
  const exactProviderModel = best.features.some(
    (feature) => feature.name === "exact_provider_model_id",
  );
  const approvedAlias = best.features.some(
    (feature) => feature.name === "approved_alias",
  );
  const uniquelyHighest = ranked.length === 1 || best.score > ranked[1].score;
  if (
    uniquelyHighest &&
    (exactCanonicalKey ||
      exactExternalId ||
      exactProviderModel ||
      approvedAlias)
  ) {
    return {
      decision: "auto_link",
      entityId: best.entity.entityId,
      score: best.score,
      features: best.features,
      reason: "Unique deterministic identity key matched.",
    };
  }
  return {
    decision: "needs_review",
    entityId: best.entity.entityId,
    score: best.score,
    features: best.features,
    reason:
      "Similarity is suggestive but lacks a unique deterministic identity key.",
  };
}

export type IdentityRelationType =
  | "ALIAS_OF"
  | "VERSION_OF"
  | "SUCCESSOR_OF"
  | "PREDECESSOR_OF"
  | "RENAMED_TO"
  | "REPLACES";

export type IdentityGraphEntity = CanonicalIdentity & {
  state: "active" | "merged" | "split";
  mergedInto?: string;
};

export type IdentityRelation = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: IdentityRelationType;
  active: boolean;
};

type GraphSnapshot = {
  entities: IdentityGraphEntity[];
  relations: IdentityRelation[];
};

export type IdentityGraphOperation = {
  id: string;
  kind: "merge" | "split";
  actor: string;
  reason: string;
  evidenceRefs: string[];
  createdAt: number;
  affectedEntityIds: string[];
  before: GraphSnapshot;
  reversedAt?: number;
  reversedBy?: string;
};

export type IdentityGraphState = GraphSnapshot & {
  operations: IdentityGraphOperation[];
};

function snapshot(state: IdentityGraphState): GraphSnapshot {
  return {
    entities: structuredClone(state.entities),
    relations: structuredClone(state.relations),
  };
}

export function mergeIdentityEntities(
  state: IdentityGraphState,
  input: {
    sourceEntityIds: string[];
    targetEntityId: string;
    actor: string;
    reason: string;
    evidenceRefs: string[];
    now: number;
  },
) {
  const next = structuredClone(state);
  const target = next.entities.find(
    (entity) => entity.entityId === input.targetEntityId,
  );
  if (!target) throw new Error("Merge target entity does not exist.");
  const sources = input.sourceEntityIds.map((id) => {
    const entity = next.entities.find((candidate) => candidate.entityId === id);
    if (!entity) throw new Error(`Merge source ${id} does not exist.`);
    if (entity.providerId !== target.providerId)
      throw new Error(
        "Cross-provider merge requires a documented shared identity review.",
      );
    return entity;
  });
  const before = snapshot(next);
  for (const source of sources) {
    if (source.entityId === target.entityId) continue;
    source.state = "merged";
    source.mergedInto = target.entityId;
    next.relations.push({
      id: sha256(["merge", source.entityId, target.entityId, input.now]),
      fromEntityId: source.entityId,
      toEntityId: target.entityId,
      type: "ALIAS_OF",
      active: true,
    });
  }
  const operation: IdentityGraphOperation = {
    id: sha256([
      "merge",
      input.sourceEntityIds,
      input.targetEntityId,
      input.now,
    ]),
    kind: "merge",
    actor: input.actor,
    reason: input.reason,
    evidenceRefs: input.evidenceRefs,
    createdAt: input.now,
    affectedEntityIds: [
      ...new Set([...input.sourceEntityIds, input.targetEntityId]),
    ],
    before,
  };
  next.operations.push(operation);
  return { state: next, operation };
}

export function splitIdentityEntity(
  state: IdentityGraphState,
  input: {
    entityId: string;
    children: CanonicalIdentity[];
    actor: string;
    reason: string;
    evidenceRefs: string[];
    now: number;
  },
) {
  const next = structuredClone(state);
  const entity = next.entities.find(
    (candidate) => candidate.entityId === input.entityId,
  );
  if (!entity) throw new Error("Split source entity does not exist.");
  if (input.children.length < 2)
    throw new Error("A split must create at least two entities.");
  const before = snapshot(next);
  entity.state = "split";
  for (const child of input.children) {
    if (
      next.entities.some((candidate) => candidate.entityId === child.entityId)
    ) {
      throw new Error(`Split child ${child.entityId} already exists.`);
    }
    next.entities.push({ ...child, state: "active" });
    next.relations.push({
      id: sha256(["split", entity.entityId, child.entityId, input.now]),
      fromEntityId: child.entityId,
      toEntityId: entity.entityId,
      type: "VERSION_OF",
      active: true,
    });
  }
  const operation: IdentityGraphOperation = {
    id: sha256([
      "split",
      entity.entityId,
      input.children.map((child) => child.entityId),
      input.now,
    ]),
    kind: "split",
    actor: input.actor,
    reason: input.reason,
    evidenceRefs: input.evidenceRefs,
    createdAt: input.now,
    affectedEntityIds: [
      entity.entityId,
      ...input.children.map((child) => child.entityId),
    ],
    before,
  };
  next.operations.push(operation);
  return { state: next, operation };
}

export function reverseIdentityOperation(
  state: IdentityGraphState,
  operationId: string,
  actor: string,
  now: number,
) {
  const next = structuredClone(state);
  const operation = next.operations.find(
    (candidate) => candidate.id === operationId,
  );
  if (!operation) throw new Error("Identity operation does not exist.");
  if (operation.reversedAt)
    throw new Error("Identity operation was already reversed.");
  next.entities = structuredClone(operation.before.entities);
  next.relations = structuredClone(operation.before.relations);
  operation.reversedAt = now;
  operation.reversedBy = actor;
  return next;
}
