import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { attentionLabel, attentionLevel, attentionReason } from "@/lib/simple-ui";
import {
  AttentionPill,
  SimpleActionLink,
  SimpleCard,
  SimpleCardHeader,
  SimplePageHeader,
} from "@/components/simple/SimpleUI";
import { courtListenerUrl, formatDate, formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Driver = {
  label?: string;
  type?: string;
  weight?: number;
};

async function getCompany(id: string) {
  return prisma.company.findUnique({
    where: { id },
    include: {
      sector: { select: { label: true } },
      links: {
        include: { caseRef: true },
        orderBy: { caseRef: { dateFiled: "desc" } },
        take: 20,
      },
      scores: { orderBy: { computedAt: "desc" }, take: 1 },
      alerts: { take: 8, orderBy: { createdAt: "desc" } },
      _count: { select: { links: true } },
    },
  });
}

export default async function SimpleCompanyPage({ params }: { params: { id: string } }) {
  const company = await getCompany(params.id);
  if (!company) notFound();

  const score = company.scores[0];
  const drivers = extractDrivers(score?.drivers);
  const driverTypes = drivers.map((driver) => driver.type).filter((type): type is string => Boolean(type));
  const level = attentionLevel({
    score: score?.score ?? 0,
    band: score?.band ?? "low",
    delta7d: score?.delta7d,
    recentCases: score?.recentCases,
    driverTypes,
  });
  const reason = attentionReason({
    score: score?.score ?? 0,
    band: score?.band ?? "low",
    delta7d: score?.delta7d,
    recentCases: score?.recentCases,
    driverTypes,
  });
  const cases = company.links.map((link) => ({ ...link.caseRef, role: link.role }));

  return (
    <div className="space-y-8">
      <Link
        href="/simple"
        className="inline-flex items-center gap-1 text-xs text-[hsl(33_14%_43%)] hover:text-[hsl(34_24%_14%)]"
      >
        <ChevronLeft className="size-3.5" /> back to simple queue
      </Link>

      <SimplePageHeader
        eyebrow="Simple company brief"
        title={company.name}
        description={
          <>
            {company.ticker && <span className="font-mono">{company.ticker}</span>}
            {company.ticker && company.sector?.label ? " · " : ""}
            {company.sector?.label ?? "Unclassified sector"} · {company._count.links.toLocaleString()} cases on record
          </>
        }
        action={<SimpleActionLink href={`/companies/${company.id}`}>Advanced profile</SimpleActionLink>}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SimpleCard className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-[hsl(33_14%_43%)]">Current status</div>
              <div className="mt-3 font-mono text-6xl font-semibold leading-none text-[hsl(34_24%_14%)]">
                {score?.score ?? 0}
              </div>
              <div className="mt-2 text-sm uppercase tracking-[0.18em] text-[hsl(33_14%_43%)]">
                {score?.band ?? "low"}
              </div>
            </div>
            <AttentionPill level={level} label={attentionLabel(level)} />
          </div>
          <p className="mt-6 text-base leading-7 text-[hsl(33_14%_30%)]">{reason}</p>
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-[hsl(35_24%_84%)] pt-5">
            <BriefMetric label="Recent cases" value={(score?.recentCases ?? 0).toLocaleString()} />
            <BriefMetric
              label="7d change"
              value={score?.delta7d == null ? "flat" : `${score.delta7d > 0 ? "+" : ""}${score.delta7d}`}
            />
            <BriefMetric label="Cases" value={company._count.links.toLocaleString()} />
            <BriefMetric label="Updated" value={score ? formatRelative(score.computedAt) : "unknown"} />
          </dl>
        </SimpleCard>

        <SimpleCard>
          <SimpleCardHeader
            title="Why this matters"
            subtitle="Deterministic score drivers translated into a short review brief."
          />
          {drivers.length === 0 ? (
            <div className="px-5 py-8 text-sm text-[hsl(33_14%_43%)]">
              No notable drivers. The score reflects steady-state activity.
            </div>
          ) : (
            <ul className="divide-y divide-[hsl(35_24%_84%)]">
              {drivers.slice(0, 4).map((driver, index) => (
                <li key={`${driver.type}-${index}`} className="px-5 py-4">
                  <div className="text-sm font-semibold text-[hsl(34_24%_14%)]">
                    {driver.label ?? driver.type ?? "Signal"}
                  </div>
                  {driver.weight != null && (
                    <div className="mt-1 text-xs text-[hsl(33_14%_43%)]">weight {driver.weight.toFixed(2)}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SimpleCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SimpleCard>
          <SimpleCardHeader
            title="Recent changes"
            subtitle="Latest alerts tied to this company."
            right={<SimpleActionLink href="/simple/alerts">All alerts</SimpleActionLink>}
          />
          {company.alerts.length === 0 ? (
            <div className="px-5 py-8 text-sm text-[hsl(33_14%_43%)]">No recent alerts.</div>
          ) : (
            <ul className="divide-y divide-[hsl(35_24%_84%)]">
              {company.alerts.map((alert) => (
                <li key={alert.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[hsl(34_24%_14%)]">{alert.title}</h3>
                      <p className="mt-1 text-sm leading-5 text-[hsl(33_14%_36%)]">{alert.body}</p>
                    </div>
                    <div className="shrink-0 text-xs text-[hsl(33_14%_43%)]">{formatRelative(alert.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SimpleCard>

        <SimpleCard>
          <SimpleCardHeader
            title="Recent cases"
            subtitle="Source links open the canonical CourtListener docket when available."
          />
          {cases.length === 0 ? (
            <div className="px-5 py-8 text-sm text-[hsl(33_14%_43%)]">No cases.</div>
          ) : (
            <ul className="divide-y divide-[hsl(35_24%_84%)]">
              {cases.slice(0, 8).map((caseRef) => {
                const href = courtListenerUrl(caseRef.sourceId ?? null, caseRef.caseName);
                const row = (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-[hsl(34_24%_14%)]">{caseRef.caseName}</h3>
                      <p className="mt-1 text-xs text-[hsl(33_14%_43%)]">
                        {caseRef.court ?? "Unknown court"} · {caseRef.natureOfSuit ?? "Uncategorized"} ·{" "}
                        {formatDate(caseRef.dateFiled)}
                      </p>
                    </div>
                    {href && <ExternalLink className="mt-0.5 size-4 shrink-0 text-[hsl(33_14%_43%)]" />}
                  </div>
                );
                return (
                  <li key={caseRef.id}>
                    {href ? (
                      <Link
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-5 py-4 transition hover:bg-[hsl(38_48%_92%)]"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div className="px-5 py-4">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </SimpleCard>
      </div>
    </div>
  );
}

function BriefMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.16em] text-[hsl(33_14%_43%)]">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-semibold text-[hsl(34_24%_14%)]">{value}</dd>
    </div>
  );
}

function extractDrivers(drivers: unknown): Driver[] {
  if (!Array.isArray(drivers)) return [];
  return drivers.filter((driver): driver is Driver => typeof driver === "object" && driver !== null);
}
