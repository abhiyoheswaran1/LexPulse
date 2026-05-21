import { NextResponse } from "next/server";
import { getPlatformStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getPlatformStatus();
  return NextResponse.json(
    {
      ok: status.ok,
      generatedAt: status.generatedAt,
      database: status.database,
      latestScoreAt: status.freshness.latestScoreAt,
      latestAlertAt: status.freshness.latestAlertAt,
    },
    { status: status.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
