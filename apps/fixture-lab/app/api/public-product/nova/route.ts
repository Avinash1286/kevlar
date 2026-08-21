export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      schema_version: "1.0",
      id: "nova-headphones",
      title: "Nova Wireless Headphones",
      purchase_price: { amount: 129, currency: "USD", kind: "one_time" },
      monthly_payment: {
        amount: 10.75,
        currency: "USD",
        period: "month",
        term_months: 12,
      },
      availability: "in_stock",
      fixture_version: "v1",
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
