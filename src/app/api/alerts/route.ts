import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50));
  const alerts = await prisma.alert.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: { company: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ alerts });
}
