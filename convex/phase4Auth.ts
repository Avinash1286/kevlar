export function requirePhase4IngestKey(provided: string): void {
  const expected = process.env.KEVLAR_BASELINE_INGEST_KEY;
  if (!expected || provided !== expected)
    throw new Error("Unauthorized Phase 4 persistence request");
}

export function assertOperationText(value: string, name: string): void {
  if (value.length === 0 || value.length > 240)
    throw new Error(`${name} must contain 1-240 characters`);
}
