import Link from "next/link";

export default function IncidentNotFound() {
  return (
    <main className="empty-page">
      <span className="overline">404 / INCIDENT</span>
      <h1>No durable incident was found.</h1>
      <Link className="primary-action" href="/feed">
        Return to trust feed →
      </Link>
    </main>
  );
}
