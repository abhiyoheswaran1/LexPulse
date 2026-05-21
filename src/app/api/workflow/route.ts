import { NextResponse } from "next/server";
import { getOrCreateAccount, loadWorkspacePayload } from "@/lib/account";
import { prisma } from "@/lib/db";

export async function GET() {
  const account = await getOrCreateAccount();
  const workspace = await loadWorkspacePayload(account.id);
  const watchedIds = workspace.workflow.watchlist.map((company) => company.id);

  const [alerts, companies, notes] = await Promise.all([
    prisma.alert.findMany({
      where: watchedIds.length ? { companyId: { in: watchedIds } } : undefined,
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { company: { select: { id: true, name: true, sector: { select: { label: true } } } } },
    }),
    prisma.company.findMany({
      where: watchedIds.length ? { id: { in: watchedIds } } : undefined,
      take: watchedIds.length ? undefined : 8,
      include: {
        scores: { orderBy: { computedAt: "desc" }, take: 2 },
        _count: { select: { links: true } },
      },
    }),
    prisma.workflowNote.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const read = new Set(workspace.workflow.readAlertIds);
  const companyRows = companies
    .map((company) => {
      const latest = company.scores[0];
      const previous = company.scores[1];
      return {
        id: company.id,
        name: company.name,
        ticker: company.ticker,
        score: latest?.score ?? 0,
        band: latest?.band ?? "low",
        caseCount: company._count.links,
        recentCases: latest?.recentCases ?? 0,
        delta7d: latest?.delta7d ?? null,
        changed: previous ? latest && latest.score !== previous.score : false,
        computedAt: latest?.computedAt.toISOString() ?? null,
      };
    })
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({
    watchedCount: watchedIds.length,
    reviewNow: companyRows.filter((company) => company.score >= 85 || (company.delta7d ?? 0) >= 10).slice(0, 8),
    changedCompanies: companyRows.filter((company) => company.changed || company.delta7d !== 0).slice(0, 8),
    watchedCompanies: companyRows.slice(0, 12),
    alerts: alerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      body: alert.body,
      severity: alert.severity,
      type: alert.type,
      createdAt: alert.createdAt.toISOString(),
      read: read.has(alert.id),
      company: {
        id: alert.company.id,
        name: alert.company.name,
        sectorLabel: alert.company.sector?.label ?? "Unclassified",
      },
    })),
    notes: notes.map((note) => ({
      id: note.id,
      targetType: note.targetType,
      targetId: note.targetId,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
    })),
  });
}
