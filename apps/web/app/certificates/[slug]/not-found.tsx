import Link from "next/link";

export default function CertificateNotFound() {
  return (
    <main className="empty-page">
      <span>CERTIFICATE NOT FOUND</span>
      <h1>No measured repair certificate exists for this slug.</h1>
      <Link href="/gauntlet">Open the Gauntlet →</Link>
    </main>
  );
}
