export function requirePhase5IngestKey(provided: string): void {
  const expected = process.env.KEVLAR_BASELINE_INGEST_KEY;
  if (!expected || provided !== expected)
    throw new Error("Unauthorized Phase 5 request");
}

export function assertPhase5Text(value: string, name: string, max = 500): void {
  if (value.length === 0 || value.length > max)
    throw new Error(`${name} must contain 1-${max} characters`);
}

export function urlMatchesEndpoint(
  rawUrl: string,
  host: string,
  pathPrefix: string,
): boolean {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hostname.toLowerCase() !== host.toLowerCase()
    )
      return false;
    const normalizedPrefix =
      pathPrefix.length > 1 && pathPrefix.endsWith("/")
        ? pathPrefix.slice(0, -1)
        : pathPrefix;
    return (
      url.pathname === normalizedPrefix ||
      url.pathname.startsWith(`${normalizedPrefix}/`)
    );
  } catch {
    return false;
  }
}
