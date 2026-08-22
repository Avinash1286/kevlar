import Link from "next/link";

export const dynamic = "force-dynamic";

export default function SoftBlockControl() {
  return (
    <main
      className="negative-control control-blocked"
      data-page-state="blocked"
      data-control-id="N1"
    >
      <span className="lab-tag">N1 · NEGATIVE CONTROL</span>
      <h1>One more step.</h1>
      <p data-block-marker="challenge-platform">
        Automated traffic challenge. Verify the browser before continuing.
      </p>
      <strong>Expected Kevlar action: quarantine · never self-heal</strong>
      <Link href="/">← Fixture index</Link>
    </main>
  );
}
