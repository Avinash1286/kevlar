import { loadCertificate } from "../../../../lib/phase4-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const data = await loadCertificate(slug);
  if (!data?.parsedPayload) {
    return Response.json({ error: "certificate_not_found" }, { status: 404 });
  }
  return Response.json(data.parsedPayload, {
    headers: {
      "Content-Disposition": `attachment; filename="${slug}.json"`,
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
}
