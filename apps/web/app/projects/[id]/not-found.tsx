import Link from "next/link";

export default function ProjectNotFound() {
  return (
    <main className="empty-page">
      <span className="overline">404 / PROJECT</span>
      <h1>Trust boundary not found.</h1>
      <Link className="primary-action" href="/feed">
        Return to feed →
      </Link>
    </main>
  );
}
