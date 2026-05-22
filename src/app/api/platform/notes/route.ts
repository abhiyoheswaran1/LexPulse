import { NextResponse } from "next/server";
import { getOrCreateAccount } from "@/lib/account";
import { prisma } from "@/lib/db";
import { rejectCrossOriginMutation } from "@/lib/request-security";

export async function GET(req: Request) {
  const account = await getOrCreateAccount();
  const url = new URL(req.url);
  const targetType = url.searchParams.get("targetType");
  const targetId = url.searchParams.get("targetId");
  const notes = await prisma.workflowNote.findMany({
    where: {
      accountId: account.id,
      ...(targetType ? { targetType } : {}),
      ...(targetId ? { targetId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    notes: notes.map((note) => ({
      id: note.id,
      targetType: note.targetType,
      targetId: note.targetId,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const rejected = rejectCrossOriginMutation(req);
  if (rejected) return rejected;

  const account = await getOrCreateAccount();
  const body = await req.json().catch(() => ({}));
  const targetType = typeof body.targetType === "string" ? body.targetType : "";
  const targetId = typeof body.targetId === "string" ? body.targetId : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!targetType || !targetId || !text) {
    return NextResponse.json({ error: "targetType, targetId, and body are required" }, { status: 400 });
  }
  const note = await prisma.workflowNote.create({
    data: {
      accountId: account.id,
      targetType,
      targetId,
      body: text.slice(0, 2000),
    },
  });
  await prisma.auditLog.create({
    data: {
      accountId: account.id,
      action: "note.created",
      entityType: targetType,
      entityId: targetId,
    },
  });
  return NextResponse.json({
    note: {
      id: note.id,
      targetType: note.targetType,
      targetId: note.targetId,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    },
  });
}
