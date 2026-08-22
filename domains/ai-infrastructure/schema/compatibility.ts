export type CanonicalFieldDefinition = {
  path: string;
  entityType: string;
  dataType: "string" | "number" | "integer" | "boolean" | "enum" | "datetime";
  meaning: string;
  unit: string;
  required: boolean;
  nullable: boolean;
  minimum?: number;
  maximum?: number;
  enumValues?: string[];
  aliases?: string[];
  evidenceMinimumSupport: number;
  freshnessMs?: number;
  severity: "informational" | "material" | "critical";
};

export type CanonicalSchemaRevision = {
  schemaId: string;
  domain: string;
  revision: number;
  status: "draft" | "canary" | "active" | "supported" | "retired";
  fields: CanonicalFieldDefinition[];
};

export type CompatibilityChange = {
  field: string;
  kind:
    | "field_added"
    | "field_removed"
    | "field_renamed"
    | "type_changed"
    | "unit_changed"
    | "enum_widened"
    | "enum_narrowed"
    | "meaning_changed"
    | "evidence_policy_changed"
    | "constraint_changed";
  classification: "backward_compatible" | "policy_migration" | "breaking";
  reason: string;
};

export type CompatibilityReport = {
  classification: "backward_compatible" | "policy_migration" | "breaking";
  changes: CompatibilityChange[];
};

function sorted(values: string[] | undefined) {
  return [...(values ?? [])].sort();
}

function sameValues(left: string[] | undefined, right: string[] | undefined) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function push(changes: CompatibilityChange[], change: CompatibilityChange) {
  changes.push(change);
}

export function classifySchemaCompatibility(
  previous: CanonicalSchemaRevision,
  next: CanonicalSchemaRevision,
): CompatibilityReport {
  if (previous.schemaId !== next.schemaId || previous.domain !== next.domain) {
    throw new Error("Schema revisions must belong to the same registry entry.");
  }
  if (next.revision <= previous.revision) {
    throw new Error(
      "Schema revisions are immutable and must increase monotonically.",
    );
  }

  const changes: CompatibilityChange[] = [];
  const previousByPath = new Map(
    previous.fields.map((field) => [field.path, field]),
  );
  const nextByPath = new Map(next.fields.map((field) => [field.path, field]));

  for (const field of previous.fields) {
    const candidate = nextByPath.get(field.path);
    if (!candidate) {
      const renamed = next.fields.find((item) =>
        item.aliases?.includes(field.path),
      );
      if (renamed) {
        push(changes, {
          field: field.path,
          kind: "field_renamed",
          classification: "backward_compatible",
          reason: `Renamed to ${renamed.path} with an explicit read alias.`,
        });
      } else {
        push(changes, {
          field: field.path,
          kind: "field_removed",
          classification: "breaking",
          reason: "Released canonical field was removed without an alias.",
        });
      }
      continue;
    }

    if (field.dataType !== candidate.dataType) {
      push(changes, {
        field: field.path,
        kind: "type_changed",
        classification: "breaking",
        reason: `Type changed from ${field.dataType} to ${candidate.dataType}.`,
      });
    }
    if (field.meaning !== candidate.meaning) {
      push(changes, {
        field: field.path,
        kind: "meaning_changed",
        classification: "breaking",
        reason: "Semantic meaning changed; a new field is required.",
      });
    }
    if (field.unit !== candidate.unit) {
      push(changes, {
        field: field.path,
        kind: "unit_changed",
        classification: "breaking",
        reason: `Canonical unit changed from ${field.unit} to ${candidate.unit}; an explicit migration is required.`,
      });
    }
    if (
      field.required !== candidate.required ||
      field.nullable !== candidate.nullable
    ) {
      const relaxed =
        (!candidate.required || candidate.nullable) &&
        (field.required || !field.nullable);
      push(changes, {
        field: field.path,
        kind: "constraint_changed",
        classification: relaxed ? "backward_compatible" : "breaking",
        reason: relaxed
          ? "Nullability or requiredness was relaxed."
          : "Nullability or requiredness became stricter.",
      });
    }
    if (
      field.minimum !== candidate.minimum ||
      field.maximum !== candidate.maximum
    ) {
      const widened =
        (candidate.minimum === undefined ||
          (field.minimum !== undefined &&
            candidate.minimum <= field.minimum)) &&
        (candidate.maximum === undefined ||
          (field.maximum !== undefined && candidate.maximum >= field.maximum));
      push(changes, {
        field: field.path,
        kind: "constraint_changed",
        classification: widened ? "backward_compatible" : "breaking",
        reason: widened
          ? "Numeric range was widened."
          : "Numeric range was narrowed.",
      });
    }
    if (!sameValues(field.enumValues, candidate.enumValues)) {
      const previousValues = new Set(field.enumValues ?? []);
      const nextValues = new Set(candidate.enumValues ?? []);
      const widened = [...previousValues].every((value) =>
        nextValues.has(value),
      );
      push(changes, {
        field: field.path,
        kind: widened ? "enum_widened" : "enum_narrowed",
        classification: widened ? "backward_compatible" : "breaking",
        reason: widened
          ? "Enum values were added without removing released values."
          : "A released enum value was removed.",
      });
    }
    if (field.evidenceMinimumSupport !== candidate.evidenceMinimumSupport) {
      push(changes, {
        field: field.path,
        kind: "evidence_policy_changed",
        classification: "policy_migration",
        reason:
          "Evidence support requirements changed and require policy migration.",
      });
    }
  }

  for (const field of next.fields) {
    if (
      previousByPath.has(field.path) ||
      field.aliases?.some((alias) => previousByPath.has(alias))
    ) {
      continue;
    }
    push(changes, {
      field: field.path,
      kind: "field_added",
      classification:
        field.required && !field.nullable ? "breaking" : "backward_compatible",
      reason:
        field.required && !field.nullable
          ? "A required non-nullable field was added."
          : "An optional or nullable field was added.",
    });
  }

  const classification = changes.some(
    (change) => change.classification === "breaking",
  )
    ? "breaking"
    : changes.some((change) => change.classification === "policy_migration")
      ? "policy_migration"
      : "backward_compatible";
  return { classification, changes };
}
