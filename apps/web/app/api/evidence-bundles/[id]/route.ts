import { loadEvidenceBundle } from "../../../../lib/phase9-data";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const bundle = await loadEvidenceBundle(decodeURIComponent(id));
  if (!bundle)
    return Response.json(
      { error: "evidence_bundle_not_found" },
      { status: 404 },
    );
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="kevlar-evidence-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json"`,
      "x-kevlar-integrity-digest": String(
        bundle.bundle.manifestDigest ?? bundle.bundle.digest ?? "unavailable",
      ),
    },
  });
}
