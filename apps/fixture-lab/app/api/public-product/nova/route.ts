export const dynamic = "force-dynamic";

export async function GET() {
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
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
