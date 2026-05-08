import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { courtListenerUrl } from "@/lib/utils";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const links = await prisma.companyCaseLink.findMany({
    where: { companyId: ctx.params.id },
    include: { caseRef: { include: { judge: true } } },
    orderBy: { caseRef: { dateFiled: "desc" } },
  });

  const cases = links.map((l) => ({
    id: l.caseRef.id,
    sourceId: l.caseRef.sourceId,
    caseName: l.caseRef.caseName,
    court: l.caseRef.court,
    docketNumber: l.caseRef.docketNumber,
    dateFiled: l.caseRef.dateFiled,
    dateTerminated: l.caseRef.dateTerminated,
    natureOfSuit: l.caseRef.natureOfSuit,
    cause: l.caseRef.cause,
    judge: l.caseRef.judge?.name ?? null,
    role: l.role,
    courtListenerUrl: courtListenerUrl(l.caseRef.sourceId, l.caseRef.caseName),
  }));

  return NextResponse.json({ cases });
}
