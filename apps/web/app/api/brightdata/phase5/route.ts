import { NextResponse } from "next/server";

/**
 * Bright Data requires a delivery target when a custom collector is created.
 * Phase 5 deliberately treats that push as a notification only: the governed
 * fleet runner retrieves the official snapshot by job ID and sends it through
 * Kevlar Core, so an unauthenticated webhook can never bypass verification.
 */
export async function POST() {
  return NextResponse.json(
    {
      accepted: true,
      ingestion: "polling-only",
      bypass: false,
    },
    { status: 202 },
  );
}

export async function GET() {
  return NextResponse.json({
    service: "kevlar-brightdata-phase5-receipt",
    status: "ready",
    ingestion: "polling-only",
  });
}
