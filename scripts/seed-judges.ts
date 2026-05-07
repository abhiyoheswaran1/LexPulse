// Seed JudgeProfile rows from existing data.
//
// Production path (sub-project F): pull from FJC + extracted CourtListener
// outcomes. v3.0 path (this script): synthesize a defensible profile per
// judge from in-DB stats — case count, mean duration, fraction terminated
// quickly. Idempotent upsert.

import { prisma } from "../src/lib/db";

const ONE_DAY = 86400000;

async function main() {
  const judges = await prisma.judge.findMany({
    select: {
      id: true,
      name: true,
      cases: {
        select: { dateFiled: true, dateTerminated: true },
      },
    },
  });

  let upserted = 0;
  for (const j of judges) {
    const total = j.cases.length;
    const terminated = j.cases.filter(
      (c) => c.dateFiled != null && c.dateTerminated != null,
    );
    const dismissedQuick = terminated.filter((c) => {
      const ms = c.dateTerminated!.getTime() - c.dateFiled!.getTime();
      return ms > 0 && ms < 90 * ONE_DAY;
    });

    const dismissalRate =
      terminated.length >= 5 ? dismissedQuick.length / terminated.length : null;

    let avgDurationDays: number | null = null;
    if (terminated.length > 0) {
      const sum = terminated.reduce(
        (a, c) =>
          a +
          Math.max(0, (c.dateTerminated!.getTime() - c.dateFiled!.getTime()) / ONE_DAY),
        0,
      );
      avgDurationDays = Math.round(sum / terminated.length);
    }

    await prisma.judgeProfile.upsert({
      where: { judgeId: j.id },
      create: {
        judgeId: j.id,
        dismissalRate,
        avgDurationDays,
        plaintiffWinRate: null, // outcome data not yet ingested (sub-project F)
        caseCount: total,
      },
      update: {
        dismissalRate,
        avgDurationDays,
        caseCount: total,
        computedAt: new Date(),
      },
    });
    upserted++;
  }

  console.log(`upserted ${upserted} judge profiles from ${judges.length} judges`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
