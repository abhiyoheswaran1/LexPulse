import { NextResponse } from "next/server";
import { getAccountIdFromCookie } from "@/lib/account";
import { prisma } from "@/lib/db";
import { captureErrorMessage } from "@/lib/telemetry";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.slice(0, 500) : "Client error";
  const digest = typeof body.digest === "string" ? body.digest.slice(0, 120) : null;
  const path = typeof body.path === "string" ? body.path.slice(0, 300) : null;
  const accountId = getAccountIdFromCookie();

  await captureErrorMessage(message, {
    level: "error",
    tags: { digest: digest ?? "none" },
    extra: { path },
  });

  await prisma.auditLog.create({
    data: {
      accountId,
      action: "client_error.reported",
      entityType: "error",
      metadata: { message, digest, path },
    },
  });

  return NextResponse.json({ ok: true });
}
