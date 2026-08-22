import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCertificate } from "../../../lib/phase4-data";

export const dynamic = "force-dynamic";

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadCertificate(slug);
  if (!data || !data.parsedPayload) notFound();
  const certificate = data.parsedPayload;

  return (
    <main className="console-page certificate-page">
      <header className="console-header">
        <Link className="console-brand" href="/">
          <span>K</span> Kevlar
        </Link>
        <span className="phase-tag">METAMORPHIC REPAIR CERTIFICATE</span>
      </header>

      <section className="certificate-heading">
        <div>
          <p>{certificate.certificate_id}</p>
          <h1>The repair passed every critical gate.</h1>
        </div>
        <span className="state-pill verified">CERTIFIED</span>
      </section>

      <section className="certificate-proof-grid">
        <article>
          <span>SAME COLLECTOR</span>
          <strong>{certificate.collector.collector_id}</strong>
          <p>Before and after: yes</p>
        </article>
        <article>
          <span>VISIBLE CASES</span>
          <strong>{certificate.post_approval_checks.visible_cases}</strong>
          <p>Repair-facing mutations</p>
        </article>
        <article>
          <span>HELD OUT</span>
          <strong>{certificate.post_approval_checks.held_out_cases}</strong>
          <p>Hidden from the heal prompt</p>
        </article>
        <article>
          <span>NEGATIVE CONTROLS</span>
          <strong>{certificate.post_approval_checks.negative_controls}</strong>
          <p>No false heal</p>
        </article>
      </section>

      <section className="certificate-sections">
        <article>
          <span>01 · INCIDENT</span>
          <h2>
            Observed ${certificate.incident.observed_bad_value} was quarantined.
          </h2>
          <p>
            The false price-drop alert remained blocked while $
            {certificate.release.released_value} stayed active as
            last-known-good.
          </p>
        </article>
        <article>
          <span>02 · HUMAN APPROVAL</span>
          <h2>Explicitly approved after the Tribunal.</h2>
          <p>
            {new Date(certificate.repair.approved_at).toLocaleString("en-US", {
              timeZone: "UTC",
            })}{" "}
            UTC · prompt {certificate.repair.heal_prompt_hash.slice(0, 22)}
          </p>
        </article>
        <article>
          <span>03 · PRE-APPROVAL</span>
          {data.tribunalChecks.map((check) => (
            <p key={check._id}>
              <strong>{check.check.replaceAll("_", " ")}</strong> ·{" "}
              {check.status} — {check.summary}
            </p>
          ))}
        </article>
        <article>
          <span>04 · INTEGRITY DIGEST</span>
          <code>{certificate.integrity.certificate_digest}</code>
          <p>SHA-256 integrity digest over the canonical measured payload.</p>
        </article>
      </section>

      <footer className="certificate-actions">
        <Link href={`/certificates/${slug}/json`}>
          Download machine-readable JSON →
        </Link>
        <Link href="/gauntlet">Inspect Gauntlet results →</Link>
      </footer>
    </main>
  );
}
