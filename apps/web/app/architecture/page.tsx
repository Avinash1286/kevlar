import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "System architecture — Kevlar",
  description:
    "How Bright Data, Convex, TypeScript, Next.js, and Vercel turn changing webpages into verified facts.",
};

const stack = [
  "Bright Data · acquisition + repair",
  "Convex · state + orchestration",
  "TypeScript · verification",
  "Next.js + Vercel · delivery",
] as const;

export default function ArchitecturePage() {
  return (
    <main className="architecture-page">
      <header className="topbar architecture-topbar">
        <Link className="brand" href="/" aria-label="Kevlar home">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <div className="phase-pill">
          <span /> System architecture
        </div>
        <Link className="repo-link" href="/">
          Back home →
        </Link>
      </header>

      <section className="architecture-shell">
        <header className="architecture-intro">
          <div>
            <div className="eyebrow">ONE CLAIM · ONE TRUSTED PATH</div>
            <h1>From changing page to released fact.</h1>
          </div>
          <p>
            Every successful scrape enters as an untrusted claim. Kevlar checks
            its meaning before an application or AI agent can use it.
          </p>
        </header>

        <div className="architecture-stack" aria-label="Technology stack">
          {stack.map((technology) => (
            <span key={technology}>{technology}</span>
          ))}
        </div>

        <section
          className="architecture-diagram"
          aria-label="Kevlar system architecture"
        >
          <div className="architecture-primary-row">
            <article className="architecture-node architecture-node-source">
              <span>01 · SOURCE ON VERCEL</span>
              <h2>Nova fixture</h2>
              <strong>$129 purchase</strong>
              <small>$10.75 monthly</small>
            </article>

            <div className="architecture-arrow" aria-hidden="true">
              →
            </div>

            <article className="architecture-node architecture-node-acquire">
              <span>02 · ACQUIRE</span>
              <h2>Bright Data</h2>
              <strong>Custom Browser collector</strong>
              <small>Structured row + evidence</small>
            </article>

            <div className="architecture-arrow" aria-hidden="true">
              →
            </div>

            <article className="architecture-node architecture-node-memory">
              <span>03 · PERSIST</span>
              <h2>Convex</h2>
              <strong>Runs, evidence, history</strong>
              <small>Durable workflow state</small>
            </article>

            <div className="architecture-arrow" aria-hidden="true">
              →
            </div>

            <article className="architecture-node architecture-node-gate">
              <span>04 · VERIFY</span>
              <h2>TypeScript gate</h2>
              <strong>Schema + meaning</strong>
              <small>Evidence + release policy</small>
            </article>

            <div
              className="architecture-arrow architecture-arrow-pass"
              aria-hidden="true"
            >
              <small>PASS</small>→
            </div>

            <article className="architecture-node architecture-node-release">
              <span>05 · RELEASE</span>
              <h2>Next.js on Vercel</h2>
              <strong>Verified fact + event</strong>
              <small>Console · API · SDK · MCP</small>
            </article>
          </div>

          <div className="architecture-failure-heading">
            <span>FAIL PATH</span>
            <strong>Wrong meaning never bypasses the release gate.</strong>
          </div>

          <div className="architecture-failure-row">
            <article className="architecture-fail-card">
              <span>BLOCK</span>
              <strong>Quarantine $10.75</strong>
              <small>Keep verified $129 last-known-good</small>
            </article>
            <div className="architecture-loop-arrow" aria-hidden="true">
              →
            </div>
            <article>
              <span>REPAIR</span>
              <strong>Bright Data candidate</strong>
            </article>
            <div className="architecture-loop-arrow" aria-hidden="true">
              →
            </div>
            <article>
              <span>REVIEW</span>
              <strong>Human approval</strong>
            </article>
            <div className="architecture-loop-arrow" aria-hidden="true">
              →
            </div>
            <article>
              <span>PROVE</span>
              <strong>Held-out Gauntlet</strong>
            </article>
            <div className="architecture-loop-arrow" aria-hidden="true">
              →
            </div>
            <article className="architecture-cert-card">
              <span>CERTIFY</span>
              <strong>Certificate → gate</strong>
            </article>
          </div>
        </section>

        <div className="architecture-rule">
          <span>A successful scrape is a claim.</span>
          <strong>A verified release is a fact with a receipt.</strong>
        </div>
      </section>
    </main>
  );
}
