import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeCompanyName } from "@/lib/resolve";

// GET /api/search?q=acme
//
// Two-stage search:
//   1. Exact normKey match (fast, catches "Acme Inc." == "ACME").
//   2. Case-insensitive substring on display name.
// Results merged, dedup'd, capped at 20.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });

  const { key } = normalizeCompanyName(q);

  const [exact, fuzzy] = await Promise.all([
    key
      ? prisma.company.findMany({
          where: { normKey: { startsWith: key } },
          take: 10,
          include: {
            scores: { orderBy: { computedAt: "desc" }, take: 1 },
            _count: { select: { links: true } },
          },
        })
      : Promise.resolve([]),
    prisma.company.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      take: 20,
      include: {
        scores: { orderBy: { computedAt: "desc" }, take: 1 },
        _count: { select: { links: true } },
      },
    }),
  ]);

  const seen = new Set<string>();
  const merged = [...exact, ...fuzzy]
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .slice(0, 20)
    .map((c) => ({
      id: c.id,
      name: c.name,
      caseCount: c._count.links,
      score: c.scores[0]?.score ?? 0,
      band: c.scores[0]?.band ?? "low",
      recentCases: c.scores[0]?.recentCases ?? 0,
      delta7d: c.scores[0]?.delta7d ?? null,
    }));

  return NextResponse.json({ results: merged });
}
