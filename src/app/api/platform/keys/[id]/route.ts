import { NextResponse } from "next/server";
import { getOrCreateAccount } from "@/lib/account";
import { prisma } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const account = await getOrCreateAccount();
  const key = await prisma.apiKey.updateMany({
    where: { id: params.id, accountId: account.id },
    data: { revokedAt: new Date() },
  });
  if (key.count === 0) return NextResponse.json({ error: "API key not found" }, { status: 404 });
  await prisma.auditLog.create({
    data: {
      accountId: account.id,
      action: "api_key.revoked",
      entityType: "api_key",
      entityId: params.id,
    },
  });
  return NextResponse.json({ ok: true });
}
