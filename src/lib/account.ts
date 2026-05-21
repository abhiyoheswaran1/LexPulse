import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EMPTY_WORKFLOW_STATE, parseWorkflowState, type WorkflowState } from "@/lib/workflow";

export const ACCOUNT_COOKIE = "lexpulse_account";

export type WorkspacePreference = {
  defaultWorkspace: "analyst" | "brief";
  onboardingComplete: boolean;
  digestFrequency: "off" | "daily" | "weekly";
  digestChannel: "none" | "email" | "slack";
  alertThreshold: "review" | "monitor" | "all";
};

export type WorkspacePayload = {
  account: {
    id: string;
    email: string | null;
    name: string | null;
    plan: string;
    createdAt: string;
    lastSeenAt: string | null;
  };
  workflow: WorkflowState;
  preference: WorkspacePreference;
};

const DEFAULT_PREFERENCE: WorkspacePreference = {
  defaultWorkspace: "analyst",
  onboardingComplete: false,
  digestFrequency: "daily",
  digestChannel: "none",
  alertThreshold: "review",
};

export async function getOrCreateAccount() {
  const cookieStore = cookies();
  const existingId = cookieStore.get(ACCOUNT_COOKIE)?.value;
  const existing = existingId
    ? await prisma.account.findUnique({
        where: { id: existingId },
        include: { preference: true },
      })
    : null;

  const account =
    existing ??
    (await prisma.account.create({
      data: {
        preference: { create: DEFAULT_PREFERENCE },
        auditLogs: {
          create: {
            action: "account.created",
            entityType: "account",
          },
        },
      },
      include: { preference: true },
    }));

  cookieStore.set(ACCOUNT_COOKIE, account.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  if (!account.preference) {
    await prisma.accountPreference.create({ data: { accountId: account.id, ...DEFAULT_PREFERENCE } });
  }

  await prisma.account.update({ where: { id: account.id }, data: { lastSeenAt: new Date() } });
  return account;
}

export function getAccountIdFromCookie() {
  return cookies().get(ACCOUNT_COOKIE)?.value ?? null;
}

export async function loadWorkspacePayload(accountId: string): Promise<WorkspacePayload> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      preference: true,
      watchlist: {
        include: { company: { select: { id: true, name: true, ticker: true } } },
        orderBy: { savedAt: "desc" },
      },
      savedSearches: { orderBy: { createdAt: "desc" } },
      savedAlertFilters: { orderBy: { createdAt: "desc" } },
      alertStates: {
        where: { readAt: { not: null } },
        select: { alertId: true },
      },
    },
  });

  if (!account) {
    return {
      account: {
        id: accountId,
        email: null,
        name: null,
        plan: "starter",
        createdAt: new Date().toISOString(),
        lastSeenAt: null,
      },
      workflow: EMPTY_WORKFLOW_STATE,
      preference: DEFAULT_PREFERENCE,
    };
  }

  return {
    account: {
      id: account.id,
      email: account.email,
      name: account.name,
      plan: account.plan,
      createdAt: account.createdAt.toISOString(),
      lastSeenAt: account.lastSeenAt?.toISOString() ?? null,
    },
    workflow: {
      version: 1,
      watchlist: account.watchlist.map((item) => ({
        id: item.company.id,
        name: item.company.name,
        ticker: item.company.ticker,
        savedAt: item.savedAt.toISOString(),
      })),
      savedSearches: account.savedSearches.map((item) => ({
        id: item.id,
        query: item.query,
        createdAt: item.createdAt.toISOString(),
      })),
      savedAlertFilters: account.savedAlertFilters.map((item) => ({
        id: item.id,
        name: item.name,
        filters: normalizeAlertFilters(item.filters),
        createdAt: item.createdAt.toISOString(),
      })),
      readAlertIds: account.alertStates.map((item) => item.alertId),
    },
    preference: normalizePreference(account.preference),
  };
}

export async function persistWorkspace(accountId: string, workflow: WorkflowState, preference?: Partial<WorkspacePreference>) {
  const normalized = parseWorkflowState(JSON.stringify(workflow));
  const companyIds = [...new Set(normalized.watchlist.map((company) => company.id))];
  const validCompanies = companyIds.length
    ? await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true } })
    : [];
  const validCompanyIds = new Set(validCompanies.map((company) => company.id));
  const alertIds = [...new Set(normalized.readAlertIds)];
  const validAlerts = alertIds.length
    ? await prisma.alert.findMany({ where: { id: { in: alertIds } }, select: { id: true } })
    : [];
  const readIds = validAlerts.map((alert) => alert.id);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.accountWatchlist.deleteMany({
      where: {
        accountId,
        companyId: { notIn: [...validCompanyIds] },
      },
    });
    for (const company of normalized.watchlist) {
      if (!validCompanyIds.has(company.id)) continue;
      await tx.accountWatchlist.upsert({
        where: { accountId_companyId: { accountId, companyId: company.id } },
        update: { savedAt: new Date(company.savedAt) },
        create: {
          accountId,
          companyId: company.id,
          savedAt: new Date(company.savedAt),
        },
      });
    }

    await tx.accountSavedSearch.deleteMany({ where: { accountId } });
    if (normalized.savedSearches.length) {
      await tx.accountSavedSearch.createMany({
        data: normalized.savedSearches.map((search) => ({
          id: search.id,
          accountId,
          query: search.query,
          createdAt: new Date(search.createdAt),
        })),
        skipDuplicates: true,
      });
    }

    await tx.accountSavedAlertFilter.deleteMany({ where: { accountId } });
    if (normalized.savedAlertFilters.length) {
      await tx.accountSavedAlertFilter.createMany({
        data: normalized.savedAlertFilters.map((filter) => ({
          id: filter.id,
          accountId,
          name: filter.name,
          filters: filter.filters,
          createdAt: new Date(filter.createdAt),
        })),
        skipDuplicates: true,
      });
    }

    await tx.accountAlertState.updateMany({
      where: { accountId, alertId: { notIn: readIds } },
      data: { readAt: null },
    });
    await tx.accountAlertState.deleteMany({
      where: {
        accountId,
        alertId: { notIn: readIds },
        readAt: null,
        reviewedAt: null,
        note: null,
        assignedTo: null,
      },
    });
    for (const alertId of readIds) {
      await tx.accountAlertState.upsert({
        where: { accountId_alertId: { accountId, alertId } },
        update: { readAt: now, reviewedAt: now },
        create: { accountId, alertId, readAt: now, reviewedAt: now },
      });
    }

    if (preference) {
      await tx.accountPreference.upsert({
        where: { accountId },
        update: preference,
        create: { accountId, ...DEFAULT_PREFERENCE, ...preference },
      });
    }

    await tx.auditLog.create({
      data: {
        accountId,
        action: "workspace.synced",
        entityType: "workspace",
        metadata: {
          watchlist: normalized.watchlist.length,
          savedSearches: normalized.savedSearches.length,
          savedAlertFilters: normalized.savedAlertFilters.length,
          readAlerts: normalized.readAlertIds.length,
        },
      },
    });
  });
}

export async function createApiKey(accountId: string, name: string) {
  const secret = `lxp_${randomBytes(24).toString("base64url")}`;
  const prefix = secret.slice(0, 12);
  const keyHash = hashSecret(secret);
  const key = await prisma.apiKey.create({
    data: {
      accountId,
      name: name.trim() || "LexPulse API key",
      prefix,
      keyHash,
    },
  });
  await prisma.auditLog.create({
    data: {
      accountId,
      action: "api_key.created",
      entityType: "api_key",
      entityId: key.id,
    },
  });
  return { id: key.id, name: key.name, prefix: key.prefix, secret, createdAt: key.createdAt.toISOString() };
}

export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function normalizePreference(value: unknown): WorkspacePreference {
  const preference = value as Partial<WorkspacePreference> | null | undefined;
  return {
    defaultWorkspace: preference?.defaultWorkspace === "brief" ? "brief" : "analyst",
    onboardingComplete: Boolean(preference?.onboardingComplete),
    digestFrequency:
      preference?.digestFrequency === "off" || preference?.digestFrequency === "weekly"
        ? preference.digestFrequency
        : DEFAULT_PREFERENCE.digestFrequency,
    digestChannel:
      preference?.digestChannel === "email" || preference?.digestChannel === "slack"
        ? preference.digestChannel
        : DEFAULT_PREFERENCE.digestChannel,
    alertThreshold:
      preference?.alertThreshold === "monitor" || preference?.alertThreshold === "all"
        ? preference.alertThreshold
        : DEFAULT_PREFERENCE.alertThreshold,
  };
}

function normalizeAlertFilters(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      impact: "all",
      sector: "all",
      type: "all",
      read: "all",
      company: "",
      watchlistOnly: false,
    };
  }
  const filters = value as Record<string, unknown>;
  return {
    impact: typeof filters.impact === "string" ? filters.impact : "all",
    sector: typeof filters.sector === "string" ? filters.sector : "all",
    type: typeof filters.type === "string" ? filters.type : "all",
    read: typeof filters.read === "string" ? filters.read : "all",
    company: typeof filters.company === "string" ? filters.company : "",
    watchlistOnly: filters.watchlistOnly === true,
  };
}
