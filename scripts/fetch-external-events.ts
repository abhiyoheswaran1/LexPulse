import "dotenv/config";

import { prisma } from "../src/lib/db";
import { classifyMaterialEvent } from "../src/lib/outcomes";
import { normalizeCompanyName } from "../src/lib/resolve";
import { failIngestRun, finishIngestRun, startIngestRun } from "./lib/data-ingest";

const SOURCES = {
  sec: "https://www.sec.gov/enforcement-litigation/litigation-releases",
  cfpb: "https://www.consumerfinance.gov/enforcement/actions/",
};

type Args = {
  source: "all" | "sec" | "cfpb";
  limit: number;
};

type ParsedExternalEvent = {
  source: string;
  sourceId: string;
  title: string;
  body: string | null;
  url: string;
  eventDate: Date | null;
};

function parseArgs(): Args {
  const args: Args = { source: "all", limit: 100 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--source") args.source = argv[++i] as Args["source"];
    else if (argv[i] === "--limit") args.limit = Number(argv[++i]);
  }
  if (!["all", "sec", "cfpb"].includes(args.source)) args.source = "all";
  if (!Number.isFinite(args.limit) || args.limit <= 0) args.limit = 100;
  return args;
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  return Promise.race([
    (async () => {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": process.env.EDGAR_USER_AGENT || "LexPulse Data Refresh contact@example.com",
        },
      });
      if (!res.ok) throw new Error(`fetch failed ${res.status} ${url}`);
      return await res.text();
    })(),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error(`fetch timed out after 15s: ${url}`)), 15_000),
    ),
  ]).finally(() => clearTimeout(timeout));
}

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseSecEvents(html: string, limit: number): ParsedExternalEvent[] {
  const events: ParsedExternalEvent[] = [];
  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRe) ?? [];
  for (const row of rows) {
    const text = stripTags(row);
    const release = /LR-\d+/i.exec(text)?.[0];
    if (!release) continue;
    const href = /href="([^"]*\/enforcement-litigation\/litigation-releases\/[^"]+)"/i.exec(row)?.[1];
    const date = parseLooseDate(text);
    const title = text.replace(/\s*Release No\..*$/i, "").replace(/\s*LR-\d+.*$/i, "").trim();
    events.push({
      source: "sec_litigation_release",
      sourceId: release.toUpperCase(),
      title: title || text.slice(0, 180),
      body: text,
      url: href ? new URL(href, "https://www.sec.gov").toString() : SOURCES.sec,
      eventDate: date,
    });
    if (events.length >= limit) break;
  }
  return events;
}

function parseCfpbEvents(html: string, limit: number): ParsedExternalEvent[] {
  const text = stripTags(html);
  const chunks = text.split(/Date filed:\s+/i).slice(1);
  const events: ParsedExternalEvent[] = [];
  for (const chunk of chunks) {
    const date = parseLooseDate(chunk.slice(0, 40));
    const title = chunk
      .replace(/^[A-Z]{3}\s+\d{1,2},\s+\d{4}\s+/i, "")
      .split(/\s+On\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4},\s+/)[0]
      .trim();
    if (!title) continue;
    const sourceId = `cfpb-${(date?.toISOString().slice(0, 10) ?? "unknown")}-${normalizeCompanyName(title).key.slice(0, 80)}`;
    events.push({
      source: "cfpb_enforcement_action",
      sourceId,
      title,
      body: chunk.slice(0, 1000),
      url: SOURCES.cfpb,
      eventDate: date,
    });
    if (events.length >= limit) break;
  }
  return events;
}

function parseLooseDate(text: string): Date | null {
  const match = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\b/i.exec(text);
  if (!match) return null;
  const parsed = new Date(match[0].replace(".", ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function loadAliasIndex() {
  const aliases = await prisma.companyAlias.findMany({
    select: {
      normKey: true,
      companyMasterId: true,
      companyMaster: { select: { id: true } },
    },
  });
  const byKey = new Map<string, string>();
  for (const alias of aliases) byKey.set(alias.normKey, alias.companyMasterId);
  return byKey;
}

function matchEventCompany(text: string, aliasIndex: Map<string, string>) {
  const normalized = normalizeCompanyName(text).key;
  let best: { companyMasterId: string; length: number } | null = null;
  for (const [aliasKey, companyMasterId] of aliasIndex.entries()) {
    if (aliasKey.length < 3) continue;
    if (normalized.includes(aliasKey) && (!best || aliasKey.length > best.length)) {
      best = { companyMasterId, length: aliasKey.length };
    }
  }
  return best?.companyMasterId ?? null;
}

async function main() {
  const args = parseArgs();
  const run = await startIngestRun(prisma, "external", "event_fetch", args);
  try {
    const events: ParsedExternalEvent[] = [];
    const failures: string[] = [];
    if (args.source === "all" || args.source === "sec") {
      try {
        events.push(...parseSecEvents(await fetchText(SOURCES.sec), args.limit));
      } catch (error) {
        failures.push(`sec: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (args.source === "all" || args.source === "cfpb") {
      try {
        events.push(...parseCfpbEvents(await fetchText(SOURCES.cfpb), args.limit));
      } catch (error) {
        failures.push(`cfpb: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const aliasIndex = await loadAliasIndex();

    let inserted = 0;
    let updated = 0;
    for (const event of events) {
      const classified = classifyMaterialEvent(`${event.title} ${event.body ?? ""}`);
      const companyMasterId = matchEventCompany(`${event.title} ${event.body ?? ""}`, aliasIndex);
      const result = await prisma.externalEvent.upsert({
        where: { source_sourceId: { source: event.source, sourceId: event.sourceId } },
        update: {
          title: event.title,
          body: event.body,
          url: event.url,
          eventDate: event.eventDate,
          eventType: classified.eventType,
          confidence: classified.confidence,
          amountUsd: classified.amountUsd,
          companyMasterId,
          metadata: { matchedText: classified.matchedText },
        },
        create: {
          source: event.source,
          sourceId: event.sourceId,
          title: event.title,
          body: event.body,
          url: event.url,
          eventDate: event.eventDate,
          eventType: classified.eventType,
          confidence: classified.confidence,
          amountUsd: classified.amountUsd,
          companyMasterId,
          metadata: { matchedText: classified.matchedText },
        },
      });
      if (result.createdAt.getTime() === result.fetchedAt.getTime()) inserted++;
      else updated++;
    }

    await finishIngestRun(prisma, run.id, {
      rowsFetched: events.length,
      rowsInserted: inserted,
      rowsUpdated: updated,
      rowsFailed: failures.length,
      checkpoint: { fetchedAt: new Date().toISOString(), source: args.source },
      metadata: failures.length > 0 ? { failures } : undefined,
    });
    console.log(`external events fetched: ${events.length}, inserted ${inserted}, updated ${updated}`);
  } catch (error) {
    await failIngestRun(prisma, run.id, error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
