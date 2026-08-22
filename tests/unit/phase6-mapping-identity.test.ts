import { describe, expect, it } from "vitest";
import { sha256 } from "../../packages/hashing/src/index";
import {
  aiInfrastructureCanonicalSchemaV1,
  aiInfrastructureCanonicalSchemaV2Draft,
  classifySchemaCompatibility,
  durationToMilliseconds,
  executeDeterministicMapping,
  mergeIdentityEntities,
  normalizeUsdPerMillionTokens,
  openAiCatalogMappingV1,
  openAiPricingMappingV1,
  parseMagnitude,
  resolveIdentity,
  reverseIdentityOperation,
  splitIdentityEntity,
  type CanonicalIdentity,
  type IdentityGraphState,
} from "../../domains/ai-infrastructure/src/index";

const pricingContexts = [
  "API Pricing",
  "GPT-5.6 Sol input $5.00 per 1M tokens; output $20.00 per 1M tokens",
];
const pricingObservation = {
  schema_version: "ai-infrastructure.source.v1",
  source_type: "pricing",
  source_url: "https://openai.com/api/pricing/",
  captured_at: "2026-08-22T09:00:00.000Z",
  provider: { id: "openai", name: "OpenAI" },
  records: [
    {
      kind: "pricing",
      provider_model_id: "gpt-5.6-sol",
      display_name: "GPT-5.6 Sol",
      plan: "standard",
      input_price: {
        amount: 5,
        currency: "USD",
        denominator: "million_input_tokens",
        original: { value: "$5.00", unit: "1M input tokens" },
      },
      output_price: {
        amount: 20,
        currency: "USD",
        denominator: "million_output_tokens",
        original: { value: "$20.00", unit: "1M output tokens" },
      },
      region: null,
    },
  ],
  evidence: {
    page_heading: "API Pricing",
    contexts: pricingContexts,
    screenshot_ref: null,
    content_hash: sha256(pricingContexts),
  },
} as const;

const catalogContexts = ["Models", "gpt-5.6-sol: GPT-5.6 Sol"];
const catalogObservation = {
  schema_version: "ai-infrastructure.source.v1",
  source_type: "catalog",
  source_url: "https://platform.openai.com/docs/models",
  captured_at: "2026-08-22T09:01:00.000Z",
  provider: { id: "openai", name: "OpenAI" },
  records: [
    {
      kind: "model",
      provider_model_id: "gpt-5.6-sol",
      display_name: "GPT-5.6 Sol",
      family: "gpt-5.6",
      lifecycle_status: "active",
      modalities: ["text"],
      context_window_tokens: 400_000,
      max_output_tokens: 128_000,
      capabilities: {
        tools: true,
        structured_output: true,
        vision: false,
        audio: false,
      },
    },
  ],
  evidence: {
    page_heading: "Models",
    contexts: catalogContexts,
    screenshot_ref: null,
    content_hash: sha256(catalogContexts),
  },
} as const;

const canonicalEntity: CanonicalIdentity = {
  entityId: "entity_openai_gpt_5_6_sol",
  entityType: "model",
  providerId: "openai",
  providerModelId: "gpt-5.6-sol",
  canonicalKey: "openai:gpt-5.6-sol",
  displayName: "GPT-5.6 Sol",
  family: "gpt-5.6",
  lifecycle: "active",
  externalIds: ["openai:gpt-5.6-sol"],
  aliases: ["gpt-5.6-sol"],
};

describe("Phase 6 canonical schema registry", () => {
  it("classifies an optional field as backward compatible", () => {
    const report = classifySchemaCompatibility(
      aiInfrastructureCanonicalSchemaV1,
      aiInfrastructureCanonicalSchemaV2Draft,
    );
    expect(report.classification).toBe("backward_compatible");
    expect(report.changes).toContainEqual(
      expect.objectContaining({ field: "model.region", kind: "field_added" }),
    );
  });

  it("classifies required additions and evidence changes correctly", () => {
    const breaking = classifySchemaCompatibility(
      aiInfrastructureCanonicalSchemaV1,
      {
        ...aiInfrastructureCanonicalSchemaV1,
        revision: 2,
        status: "draft",
        fields: [
          ...aiInfrastructureCanonicalSchemaV1.fields,
          {
            path: "model.required_new_field",
            entityType: "model",
            dataType: "string",
            meaning: "Required test field.",
            unit: "text",
            required: true,
            nullable: false,
            evidenceMinimumSupport: 1,
            severity: "material",
          },
        ],
      },
    );
    expect(breaking.classification).toBe("breaking");

    const policy = classifySchemaCompatibility(
      aiInfrastructureCanonicalSchemaV1,
      {
        ...aiInfrastructureCanonicalSchemaV1,
        revision: 2,
        status: "draft",
        fields: aiInfrastructureCanonicalSchemaV1.fields.map((field, index) =>
          index === 0 ? { ...field, evidenceMinimumSupport: 2 } : field,
        ),
      },
    );
    expect(policy.classification).toBe("policy_migration");
  });
});

describe("Phase 6 typed units and deterministic mappings", () => {
  it("converts magnitudes, durations, and token prices deterministically", () => {
    expect(parseMagnitude("128K")).toBe(128_000);
    expect(
      durationToMilliseconds({
        amount: 2,
        unit: "hours",
        original: { value: "2", unit: "hours" },
      }),
    ).toBe(7_200_000);
    expect(
      normalizeUsdPerMillionTokens({
        amount: 0.000005,
        currency: "USD",
        denominator: "token",
      }).amount,
    ).toBe(5);
  });

  it("maps pricing and catalog rows to one canonical identity with field provenance", () => {
    const pricing = executeDeterministicMapping(
      pricingObservation,
      openAiPricingMappingV1,
    );
    const catalog = executeDeterministicMapping(
      catalogObservation,
      openAiCatalogMappingV1,
    );
    expect(pricing).toHaveLength(1);
    expect(catalog).toHaveLength(1);
    expect(pricing[0].canonicalEntityKey).toBe("openai:gpt-5.6-sol");
    expect(catalog[0].canonicalEntityKey).toBe(pricing[0].canonicalEntityKey);
    expect(pricing[0].fields["model.input_price_usd_per_million_tokens"]).toBe(
      5,
    );
    expect(catalog[0].fields["model.context_window_tokens"]).toBe(400_000);
    expect(
      pricing[0].fieldEvidence.every(
        (field) =>
          field.sourceFields.length > 0 &&
          field.evidenceRefs.length > 0 &&
          field.rawSourceHash === sha256(pricingContexts),
      ),
    ).toBe(true);
  });

  it("rejects opaque generated code in a production mapping", () => {
    expect(() =>
      executeDeterministicMapping(pricingObservation, {
        ...openAiPricingMappingV1,
        generatedCode: "return eval(input)",
      }),
    ).toThrow(/unsafe or invalid/i);
  });
});

describe("Phase 6 entity resolution and reversible graph operations", () => {
  it("auto-links exact deterministic IDs and queues ambiguous or AI matches", () => {
    const exact = resolveIdentity(
      {
        entityType: "model",
        providerId: "openai",
        providerModelId: "gpt-5.6-sol",
        canonicalKey: "openai:gpt-5.6-sol",
        displayName: "GPT-5.6 Sol",
        family: "gpt-5.6",
        lifecycle: "active",
        externalIds: ["openai:gpt-5.6-sol"],
        candidateSource: "deterministic",
      },
      [canonicalEntity],
    );
    expect(exact.decision).toBe("auto_link");
    expect(exact.entityId).toBe(canonicalEntity.entityId);

    const ambiguous = resolveIdentity(
      {
        entityType: "model",
        providerId: "openai",
        canonicalKey: "openai:sol",
        displayName: "GPT 5.6 Sol",
        family: "gpt-5.6",
        lifecycle: "unknown",
        candidateSource: "deterministic",
      },
      [canonicalEntity],
    );
    expect(ambiguous.decision).toBe("needs_review");

    const ai = resolveIdentity(
      {
        entityType: "model",
        providerId: "openai",
        canonicalKey: "openai:sol-latest",
        displayName: "Sol latest",
        lifecycle: "unknown",
        candidateSource: "ai_suggestion",
      },
      [canonicalEntity],
    );
    expect(ai.decision).toBe("needs_review");
  });

  it("reverses both merge and split operations without erasing their audit records", () => {
    const alias: CanonicalIdentity = {
      ...canonicalEntity,
      entityId: "entity_openai_sol_alias",
      canonicalKey: "openai:sol",
      providerModelId: "sol",
      displayName: "Sol",
      externalIds: ["openai:sol"],
      aliases: [],
    };
    const initial: IdentityGraphState = {
      entities: [
        { ...canonicalEntity, state: "active" },
        { ...alias, state: "active" },
      ],
      relations: [],
      operations: [],
    };
    const merged = mergeIdentityEntities(initial, {
      sourceEntityIds: [alias.entityId],
      targetEntityId: canonicalEntity.entityId,
      actor: "reviewer:test",
      reason: "Approved provider alias.",
      evidenceRefs: ["evidence:alias"],
      now: 1,
    });
    expect(
      merged.state.entities.find((entity) => entity.entityId === alias.entityId)
        ?.state,
    ).toBe("merged");
    const mergeReversed = reverseIdentityOperation(
      merged.state,
      merged.operation.id,
      "reviewer:test",
      2,
    );
    expect(
      mergeReversed.entities.find(
        (entity) => entity.entityId === alias.entityId,
      )?.state,
    ).toBe("active");
    expect(mergeReversed.operations[0].reversedAt).toBe(2);

    const split = splitIdentityEntity(initial, {
      entityId: canonicalEntity.entityId,
      children: [
        {
          ...canonicalEntity,
          entityId: "entity_sol_2026_01",
          canonicalKey: "openai:gpt-5.6-sol:2026-01",
          version: "2026-01",
        },
        {
          ...canonicalEntity,
          entityId: "entity_sol_2026_08",
          canonicalKey: "openai:gpt-5.6-sol:2026-08",
          version: "2026-08",
        },
      ],
      actor: "reviewer:test",
      reason: "Provider version evidence requires a split.",
      evidenceRefs: ["evidence:versions"],
      now: 3,
    });
    expect(split.state.entities).toHaveLength(4);
    const splitReversed = reverseIdentityOperation(
      split.state,
      split.operation.id,
      "reviewer:test",
      4,
    );
    expect(splitReversed.entities).toHaveLength(2);
    expect(splitReversed.operations[0].reversedAt).toBe(4);
  });
});
