import { NextResponse } from "next/server";
import { getPlatformStatus } from "@/lib/status";

export async function GET() {
  const status = await getPlatformStatus();
  return NextResponse.json(status, {
    status: status.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
