import Link from "next/link";

export const dynamic = "force-dynamic";

export default function LegitimateEmptyControl() {
  return (
    <main
      className="negative-control control-empty"
      data-page-state="empty"
      data-product-state="sold-out"
      data-control-id="N2"
    >
      <span className="lab-tag">N2 · NEGATIVE CONTROL</span>
      <h1>Nova Wireless Headphones</h1>
      <p>Sold out. The optional promotional price is intentionally absent.</p>
      <strong>Expected Kevlar action: do not heal</strong>
      <Link href="/">← Fixture index</Link>
    </main>
  );
}
