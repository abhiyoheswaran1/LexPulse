import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  attentionLabel,
  attentionLevel,
  attentionReason,
  summarizeSectors,
  type AttentionLevel,
} from "@/lib/simple-ui";
import {
  AttentionPill,
  SimpleActionLink,
  SimpleCard,
  SimpleCardHeader,
  SimplePageHeader,
  SimpleTabs,
} from "@/components/simple/SimpleUI";

export const dynamic = "force-dynamic";

type Driver = { type?: string };

type SimpleCompanyRow = {
  id: string;
  name: string;
  ticker: string | null;
  sectorKey: string | null;
  sectorLabel: string | null;
  cases: bigint;
  score: number;
  band: string;
  recentCases: number;
  delta7d: number | null;
  drivers: unknown;
  computedAt: Date;
};

type SimpleCompany = {
  id: string;
  name: string;
  ticker: string | null;
  sectorKey: string | null;
  sectorLabel: string | null;
  caseCount: number;
  score: number;
  band: string;
  recentCases: number;
  delta7d: number | null;
  driverTypes: string[];
  level: AttentionLevel;
  reason: string;
};

async function getSimpleRows(): Promise<SimpleCompany[]> {
  const rows = await prisma.$queryRaw<SimpleCompanyRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON ("companyId")
        "companyId", score, band, "recentCases", "delta7d", drivers, "computedAt"
      FROM risk_scores
      WHERE "scoreVersion" = 'v3'
      ORDER BY "companyId", "computedAt" DESC
    )
    SELECT
      c.id,
      c.name,
      c.ticker,
      c."sectorKey",
      s.label AS "sectorLabel",
      COALESCE((SELECT COUNT(*) FROM company_case_link WHERE "companyId" = c.id), 0) AS cases,
      l.score,
      l.band,
      l."recentCases",
      l."delta7d",
      l.drivers,
      l."computedAt"
    FROM latest l
    JOIN companies c ON c.id = l."companyId"
    LEFT JOIN sectors s ON s.key = c."sectorKey"
  `;

  return rows.map((row) => {
    const driverTypes = extractDriverTypes(row.drivers);
    const input = {
      score: row.score,
      band: row.band,
      delta7d: row.delta7d,
      recentCases: row.recentCases,
      driverTypes,
    };
    const level = attentionLevel(input);
    return {
      id: row.id,
      name: row.name,
      ticker: row.ticker,
      sectorKey: row.sectorKey,
      sectorLabel: row.sectorLabel,
      caseCount: Number(row.cases),
      score: row.score,
      band: row.band,
      recentCases: row.recentCases,
      delta7d: row.delta7d,
      driverTypes,
      level,
      reason: attentionReason(input),
    };
  });
}

export default async function SimpleDashboardPage({
  searchParams,
}: {
  searchParams?: { view?: string };
}) {
  const rows = await getSimpleRows();
  const view = searchParams?.view === "map" ? "map" : "queue";
  const counts = countLevels(rows);
  const queue = [...rows]
    .filter((row) => row.level !== "quiet")
    .sort((a, b) => {
      const levelDiff = levelSort(b.level) - levelSort(a.level);
      if (levelDiff !== 0) return levelDiff;
      return b.score - a.score;
    })
    .slice(0, 16);
  const sectors = summarizeSectors(
    rows.map((row) => ({
      sector: row.sectorKey,
      sectorLabel: row.sectorLabel,
      score: row.score,
      band: row.band,
      recentCases: row.recentCases,
      delta7d: row.delta7d,
      driverTypes: row.driverTypes,
    })),
  );

  return (
    <div className="space-y-8">
      <SimplePageHeader
        eyebrow="Simple portfolio monitor"
        title={view === "map" ? "Portfolio risk map" : "What needs review?"}
        description="A lower-friction view of the same LexPulse data. It ranks companies by attention needed, then keeps the full analyst dashboard one click away."
        action={<SimpleTabs active={view} />}
      />

      {view === "map" ? (
        <MapView sectors={sectors} />
      ) : (
        <QueueView counts={counts} rows={queue} sectors={sectors.slice(0, 6)} />
      )}
    </div>
  );
}

function QueueView({
  counts,
  rows,
  sectors,
}: {
  counts: Record<AttentionLevel, number>;
  rows: SimpleCompany[];
  sectors: ReturnType<typeof summarizeSectors>;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard level="review" label="Review now" count={counts.review} />
        <SummaryCard level="monitor" label="Monitor" count={counts.monitor} />
        <SummaryCard level="quiet" label="Quiet" count={counts.quiet} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <SimpleCard>
          <SimpleCardHeader
            title="Priority queue"
            subtitle="Companies with high scores, material moves, severe filings, or recent filing pressure."
            right={<SimpleActionLink href="/">Advanced dashboard</SimpleActionLink>}
          />
          <div className="divide-y divide-[hsl(35_24%_84%)]">
            {rows.map((row) => (
              <CompanyQueueRow key={row.id} row={row} />
            ))}
          </div>
        </SimpleCard>

        <SimpleCard>
          <SimpleCardHeader
            title="Sector concentration"
            subtitle="A quick map of where review pressure is clustered."
            right={<SimpleActionLink href="/simple?view=map">Full map</SimpleActionLink>}
          />
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-1">
            {sectors.map((sector) => (
              <SectorMiniCard key={sector.sector} sector={sector} />
            ))}
          </div>
        </SimpleCard>
      </div>
    </>
  );
}

function MapView({ sectors }: { sectors: ReturnType<typeof summarizeSectors> }) {
  return (
    <SimpleCard>
      <SimpleCardHeader
        title="Sector map"
        subtitle="Sectors are ordered by review pressure first, then total coverage."
        right={<SimpleActionLink href="/simple">Back to queue</SimpleActionLink>}
      />
      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
        {sectors.map((sector) => (
          <SectorMapCard key={sector.sector} sector={sector} />
        ))}
      </div>
    </SimpleCard>
  );
}

function SummaryCard({
  level,
  label,
  count,
}: {
  level: AttentionLevel;
  label: string;
  count: number;
}) {
  return (
    <SimpleCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-[hsl(33_14%_43%)]">{label}</div>
          <div className="mt-2 font-mono text-4xl font-semibold leading-none text-[hsl(34_24%_14%)]">
            {count.toLocaleString()}
          </div>
        </div>
        <AttentionPill level={level} label={attentionLabel(level)} />
      </div>
    </SimpleCard>
  );
}

function CompanyQueueRow({ row }: { row: SimpleCompany }) {
  return (
    <Link
      href={`/simple/companies/${row.id}`}
      className="block px-5 py-4 transition hover:bg-[hsl(38_48%_92%)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-[hsl(34_24%_14%)]">{row.name}</h3>
            {row.ticker && (
              <span className="rounded border border-[hsl(35_24%_80%)] px-1.5 py-0.5 font-mono text-[11px] text-[hsl(33_14%_43%)]">
                {row.ticker}
              </span>
            )}
            <AttentionPill level={row.level} label={attentionLabel(row.level)} />
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[hsl(33_14%_36%)]">{row.reason}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[hsl(33_14%_43%)]">
            {row.sectorLabel && <span>{row.sectorLabel}</span>}
            <span>{row.caseCount.toLocaleString()} cases</span>
            <span>{row.recentCases.toLocaleString()} recent</span>
          </div>
        </div>
        <div className="text-left lg:text-right">
          <div className="font-mono text-3xl font-semibold leading-none text-[hsl(34_24%_14%)]">
            {row.score}
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[hsl(33_14%_43%)]">{row.band}</div>
        </div>
      </div>
    </Link>
  );
}

function SectorMiniCard({
  sector,
}: {
  sector: ReturnType<typeof summarizeSectors>[number];
}) {
  return (
    <Link
      href="/simple?view=map"
      className="rounded-lg border border-[hsl(35_24%_82%)] bg-[hsl(38_48%_94%)] p-4 transition hover:border-[hsl(34_82%_34%)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[hsl(34_24%_14%)]">{sector.label}</h3>
          <p className="mt-1 text-xs text-[hsl(33_14%_43%)]">{sector.total.toLocaleString()} tracked</p>
        </div>
        <AttentionPill level={sector.level} label={attentionLabel(sector.level)} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center font-mono text-sm">
        <MiniCount label="Review" value={sector.review} />
        <MiniCount label="Watch" value={sector.monitor} />
        <MiniCount label="Quiet" value={sector.quiet} />
      </div>
    </Link>
  );
}

function SectorMapCard({
  sector,
}: {
  sector: ReturnType<typeof summarizeSectors>[number];
}) {
  return (
    <div className="rounded-lg border border-[hsl(35_24%_82%)] bg-[hsl(38_48%_94%)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[hsl(34_24%_14%)]">{sector.label}</h3>
          <p className="mt-1 text-sm text-[hsl(33_14%_43%)]">{sector.total.toLocaleString()} companies</p>
        </div>
        <AttentionPill level={sector.level} label={attentionLabel(sector.level)} />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
        <MiniCount label="Review" value={sector.review} />
        <MiniCount label="Monitor" value={sector.monitor} />
        <MiniCount label="Quiet" value={sector.quiet} />
      </div>
    </div>
  );
}

function MiniCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[hsl(35_24%_84%)] bg-[hsl(42_44%_97%)] px-2 py-2">
      <div className="font-mono text-lg font-semibold text-[hsl(34_24%_14%)]">{value.toLocaleString()}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[hsl(33_14%_43%)]">{label}</div>
    </div>
  );
}

function countLevels(rows: SimpleCompany[]): Record<AttentionLevel, number> {
  return rows.reduce(
    (acc, row) => {
      acc[row.level] += 1;
      return acc;
    },
    { review: 0, monitor: 0, quiet: 0 } as Record<AttentionLevel, number>,
  );
}

function levelSort(level: AttentionLevel): number {
  switch (level) {
    case "review":
      return 3;
    case "monitor":
      return 2;
    case "quiet":
      return 1;
  }
}

function extractDriverTypes(drivers: unknown): string[] {
  if (!Array.isArray(drivers)) return [];
  return drivers
    .map((driver: Driver) => driver?.type)
    .filter((type): type is string => typeof type === "string");
}
