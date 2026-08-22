import Link from "next/link";
import {
  loadPhase6IdentityGraph,
  loadPhase6Proof,
} from "../../lib/phase6-data";

export const dynamic = "force-dynamic";

export default async function EntitiesPage() {
  const [data, proof] = await Promise.all([
    loadPhase6IdentityGraph(),
    loadPhase6Proof(),
  ]);
  const reviewed = new Set(
    (data?.decisions ?? []).map((decision) => decision.candidateId),
  );
  const pending = (data?.candidates ?? []).filter(
    (candidate) => !reviewed.has(candidate._id),
  );
  const aliasesFor = (entityId: string) =>
    (data?.aliases ?? []).filter(
      (alias) => alias.entityId === entityId && alias.status === "active",
    );
  const idsFor = (entityId: string) =>
    (data?.externalIds ?? []).filter(
      (item) => item.entityId === entityId && item.status === "active",
    );

  return (
    <main className="console-shell canonical-console">
      <header className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <nav className="fleet-nav">
          <Link href="/schema">Schema</Link>
          <Link href="/mappings">Mappings</Link>
          <Link href="/entities">Entities</Link>
          <Link href="/sources">Sources</Link>
        </nav>
      </header>
      <section className="gauntlet-heading">
        <div>
          <p>IDENTITY GRAPH · HUMAN REVIEW BOUNDARY</p>
          <h1>Clear matches link. Ambiguity stops.</h1>
        </div>
        <span className={`state-pill ${proof ? "verified" : "stale"}`}>
          {proof ? "PROVEN" : data ? "LIVE" : "OFFLINE"}
        </span>
      </section>
      <section className="metric-grid">
        <article>
          <span>CANONICAL ENTITIES</span>
          <strong>{data?.entities.length ?? 0}</strong>
        </article>
        <article>
          <span>RESOLVED OBSERVATIONS</span>
          <strong>
            {
              (data?.observations ?? []).filter((item) => item.resolvedEntityId)
                .length
            }
          </strong>
        </article>
        <article>
          <span>REVIEW QUEUE</span>
          <strong>{pending.length}</strong>
        </article>
        <article>
          <span>REVERSAL RECORDS</span>
          <strong>
            {
              (data?.operations ?? []).filter((item) => item.reversalOfId)
                .length
            }
          </strong>
        </article>
      </section>
      <section className="entity-grid">
        {(data?.entities ?? []).map((entity) => (
          <article key={entity._id}>
            <header>
              <div>
                <span>{entity.entityType.toUpperCase()}</span>
                <h2>{entity.displayName}</h2>
              </div>
              <span
                className={`status ${entity.status === "active" ? "verified" : "pending"}`}
              >
                <i />
                {entity.status}
              </span>
            </header>
            <code>{entity.canonicalKey}</code>
            <div className="identity-tags">
              {idsFor(entity._id).map((item) => (
                <span key={item._id}>
                  {item.namespace}:{item.externalId}
                </span>
              ))}
              {aliasesFor(entity._id).map((alias) => (
                <span key={alias._id}>
                  {alias.aliasType}:{alias.value}
                </span>
              ))}
            </div>
            <Link
              className="history-link"
              href={`/entities/${entity._id}/history`}
            >
              Open fact history →
            </Link>
          </article>
        ))}
      </section>
      <section className="review-queue">
        <header>
          <div>
            <span>AMBIGUOUS MATCHES</span>
            <h2>Human review queue</h2>
          </div>
          <small>
            Approval mutations require server-side reviewer authorization.
          </small>
        </header>
        {pending.map((candidate) => (
          <article key={candidate._id}>
            <div>
              <strong>{candidate.recommendation}</strong>
              <span>{candidate.generatedBy}</span>
            </div>
            <b>{candidate.score}</b>
            <p>{candidate.explanation}</p>
            <details>
              <summary>Interpretable score</summary>
              {candidate.features.map((feature) => (
                <code key={`${feature.name}:${feature.score}`}>
                  {feature.score >= 0 ? "+" : ""}
                  {feature.score} {feature.name} · {feature.detail}
                </code>
              ))}
            </details>
            <button disabled>Review in authenticated console</button>
          </article>
        ))}
        {pending.length === 0 ? (
          <p>No identity candidates are waiting.</p>
        ) : null}
      </section>
      <section className="operation-ledger">
        <span>MERGE / SPLIT AUDIT LEDGER</span>
        {(data?.operations ?? []).map((operation) => (
          <article key={operation._id}>
            <strong>{operation.kind}</strong>
            <code>{operation._id}</code>
            <p>{operation.reason}</p>
            <span>
              {operation.reversalOfId
                ? `reversal of ${operation.reversalOfId}`
                : operation.actor}
            </span>
          </article>
        ))}
      </section>
    </main>
  );
}
