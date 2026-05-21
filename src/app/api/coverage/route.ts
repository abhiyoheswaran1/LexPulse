import { NextResponse } from "next/server";
import { getCoverageReport } from "@/lib/coverage-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getCoverageReport());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "coverage_unavailable" },
      { status: 500 },
    );
  }
}
