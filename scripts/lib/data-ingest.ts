import type { PrismaClient } from "@prisma/client";

export async function startIngestRun(
  prisma: PrismaClient,
  source: string,
  jobType: string,
  metadata?: object,
) {
  return prisma.dataIngestRun.create({
    data: {
      source,
      jobType,
      status: "running",
      metadata: metadata ?? undefined,
    },
  });
}

export async function finishIngestRun(
  prisma: PrismaClient,
  id: string,
  counts: {
    rowsFetched?: number;
    rowsInserted?: number;
    rowsUpdated?: number;
    rowsFailed?: number;
    checkpoint?: object;
    metadata?: object;
  },
) {
  return prisma.dataIngestRun.update({
    where: { id },
    data: {
      status: "success",
      finishedAt: new Date(),
      rowsFetched: counts.rowsFetched ?? 0,
      rowsInserted: counts.rowsInserted ?? 0,
      rowsUpdated: counts.rowsUpdated ?? 0,
      rowsFailed: counts.rowsFailed ?? 0,
      checkpoint: counts.checkpoint ?? undefined,
      metadata: counts.metadata ?? undefined,
    },
  });
}

export async function failIngestRun(prisma: PrismaClient, id: string, error: unknown) {
  return prisma.dataIngestRun.update({
    where: { id },
    data: {
      status: "failed",
      finishedAt: new Date(),
      error: error instanceof Error ? error.message : String(error),
      rowsFailed: 1,
    },
  });
}
