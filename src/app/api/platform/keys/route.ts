import { NextResponse } from "next/server";
import { createApiKey, getOrCreateAccount } from "@/lib/account";
import { prisma } from "@/lib/db";

export async function GET() {
  const account = await getOrCreateAccount();
  const keys = await prisma.apiKey.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });
  return NextResponse.json({
    keys: keys.map((key) => ({
      ...key,
      createdAt: key.createdAt.toISOString(),
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      revokedAt: key.revokedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const account = await getOrCreateAccount();
  const body = await req.json().catch(() => ({}));
  const key = await createApiKey(account.id, typeof body.name === "string" ? body.name : "LexPulse API key");
  return NextResponse.json({ key });
}
