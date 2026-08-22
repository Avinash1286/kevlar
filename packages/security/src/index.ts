const SECRET_KEY =
  /(authorization|api[-_]?key|secret|password|private[-_]?key|token|cookie)/i;
const SECRET_VALUE =
  /\b(?:kv_(?:live|test|dev)|whsec|sk|Bearer)[_-]?[A-Za-z0-9._-]{12,}\b/gi;

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string")
    return value.replace(SECRET_VALUE, "[REDACTED]");
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => redactSecrets(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => [
          key,
          SECRET_KEY.test(key) ? "[REDACTED]" : redactSecrets(item, depth + 1),
        ]),
    );
  }
  return value;
}

function privateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

export function assertSafePublicUrl(
  raw: string,
  allowedHosts?: readonly string[],
) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:")
    throw new Error("Only HTTPS public endpoints are allowed.");
  if (url.username || url.password)
    throw new Error("URL credentials are prohibited.");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host.endsWith(".local") ||
    privateIpv4(host)
  )
    throw new Error("Private or loopback endpoints are prohibited.");
  if (
    allowedHosts &&
    !allowedHosts.map((item) => item.toLowerCase()).includes(host)
  )
    throw new Error("Endpoint host is not approved.");
  url.hash = "";
  return url.toString();
}

export type OperationalSignal = {
  kind:
    | "provider_failure"
    | "brightdata_pending"
    | "duplicate_event"
    | "source_outage"
    | "webhook_failure"
    | "freshness_breach";
  severity: "info" | "warning" | "critical";
  observedAt: number;
  projectId: string;
  resourceId: string;
  details: Record<string, unknown>;
};

export function alertFor(signal: OperationalSignal) {
  const critical =
    signal.kind === "source_outage" ||
    signal.kind === "webhook_failure" ||
    signal.kind === "freshness_breach";
  return {
    alertKey: `${signal.projectId}:${signal.kind}:${signal.resourceId}`,
    status: critical ? ("firing" as const) : ("observed" as const),
    severity: critical ? ("critical" as const) : signal.severity,
    runbook: `runbooks/${signal.kind.replaceAll("_", "-")}.md`,
    summary: `${signal.kind.replaceAll("_", " ")} on ${signal.resourceId}`,
    details: redactSecrets(signal.details),
  };
}

export function structuredLog(event: string, context: Record<string, unknown>) {
  return JSON.stringify({
    event,
    ...(redactSecrets(context) as Record<string, unknown>),
  });
}
