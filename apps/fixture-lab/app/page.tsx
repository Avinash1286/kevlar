import Link from "next/link";

export default function FixtureIndex() {
  return (
    <main className="lab-index">
      <span className="lab-tag">KEVLAR FIXTURE LAB · V1</span>
      <h1>
        Controlled pages.
        <br />
        Realistic evidence.
      </h1>
      <p>
        The lab hosts stable public URLs used to test collector behavior without
        hiding expected answers from the collector.
      </p>
      <Link href="/product-pricing/nova">
        Open Nova product fixture <span>→</span>
      </Link>
      <Link href="/negative-controls/soft-block">
        Open N1 soft-block control <span>→</span>
      </Link>
      <Link href="/negative-controls/legitimate-empty">
        Open N2 legitimate-empty control <span>→</span>
      </Link>
      <Link href="/gauntlet/m1">
        Open Core Gauntlet M1–H2 fixtures <span>→</span>
      </Link>
    </main>
  );
}
