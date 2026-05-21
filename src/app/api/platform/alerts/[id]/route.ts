import { NextResponse } from "next/server";
import { getOrCreateAccount } from "@/lib/account";
import { prisma } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const account = await getOrCreateAccount();
  const body = await req.json().catch(() => ({}));
  const assignedTo = typeof body.assignedTo === "string" ? body.assignedTo.trim().slice(0, 120) : undefined;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : undefined;
  const reviewed = body.reviewed === true;
  const now = new Date();

  const state = await prisma.accountAlertState.upsert({
    where: { accountId_alertId: { accountId: account.id, alertId: params.id } },
    update: {
      ...(assignedTo !== undefined ? { assignedTo: assignedTo || null } : {}),
      ...(note !== undefined ? { note: note || null } : {}),
      ...(reviewed ? { reviewedAt: now, readAt: now } : {}),
    },
    create: {
      accountId: account.id,
      alertId: params.id,
      assignedTo: assignedTo || null,
      note: note || null,
      reviewedAt: reviewed ? now : null,
      readAt: reviewed ? now : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      accountId: account.id,
      action: "alert.workflow_updated",
      entityType: "alert",
      entityId: params.id,
      metadata: { assigned: Boolean(state.assignedTo), noted: Boolean(state.note), reviewed },
    },
  });

  return NextResponse.json({
    state: {
      alertId: state.alertId,
      assignedTo: state.assignedTo,
      note: state.note,
      reviewedAt: state.reviewedAt?.toISOString() ?? null,
      readAt: state.readAt?.toISOString() ?? null,
    },
  });
}
