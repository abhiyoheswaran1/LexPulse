import Link from "next/link";
import { Panel } from "@/components/Panel";
import { Code2, ExternalLink } from "lucide-react";

export const metadata = {
  title: "API — LexPulse",
};

export default function ApiDocsPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Documentation</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1.5">
            API reference
          </h1>
          <p className="text-sm text-muted mt-2 max-w-2xl leading-relaxed">
            Public read-only endpoints. Stable across the v3.0 methodology revision. Authentication
            and rate limiting are not yet enforced — both arrive with the platform-shell milestone.
          </p>
        </div>
        <Link
          href="https://github.com/abhiyoheswaran1/LexPulse/blob/main/docs/methodology/risk-score-v3.md"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent border border-border rounded-md px-3 py-1.5"
        >
          Methodology
          <ExternalLink className="size-3" />
        </Link>
      </header>

      <Panel title="Overview" subtitle="Conventions for every endpoint below">
        <ul className="text-sm space-y-2 leading-relaxed">
          <Bullet>
            <span className="text-fg/90">Base URL.</span> All paths are relative to{" "}
            <code className="font-mono text-xs bg-panel2 px-1.5 py-0.5 rounded">
              https://lex-pulse-six.vercel.app
            </code>
            .
          </Bullet>
          <Bullet>
            <span className="text-fg/90">Format.</span> JSON only. No XML, no protobuf.
          </Bullet>
          <Bullet>
            <span className="text-fg/90">Versioning.</span> Score-shape responses include a{" "}
            <code className="font-mono text-xs bg-panel2 px-1.5 py-0.5 rounded">version</code>{" "}
            field (
            <code className="font-mono text-xs">v1.0</code> /{" "}
            <code className="font-mono text-xs">v2.0</code> /{" "}
            <code className="font-mono text-xs">v3.0</code>). Pin with{" "}
            <code className="font-mono text-xs">?version=vN</code> for replay.
          </Bullet>
          <Bullet>
            <span className="text-fg/90">Errors.</span>{" "}
            <code className="font-mono text-xs">404</code> with{" "}
            <code className="font-mono text-xs">{`{"error": "not_found"}`}</code> for missing
            resources;{" "}
            <code className="font-mono text-xs">{`{"error": "no_score"}`}</code> when an entity
            exists but lacks a snapshot for the requested version.
          </Bullet>
          <Bullet>
            <span className="text-fg/90">Attribution.</span> Litigation data flows from
            CourtListener / Free Law Project, licensed CC BY-ND 4.0. Every score response
            includes a <code className="font-mono text-xs">sources</code> block citing the upstream.
          </Bullet>
        </ul>
      </Panel>

      <Endpoint
        method="GET"
        path="/api/companies"
        description="Paginated list of companies. Sorted by latest snapshot score by default."
        params={[
          { name: "limit", desc: "Max rows returned (default 50, max 200)" },
          { name: "sort", desc: "One of `risk` (default), `cases`, `name`" },
        ]}
        example={`{
  "companies": [
    {
      "id": "cmowunl4v01jq...",
      "name": "PFIZER INC",
      "ticker": null,
      "caseCount": 57,
      "score": 100,
      "band": "high",
      "recentCases": 57
    }
  ]
}`}
      />

      <Endpoint
        method="GET"
        path="/api/companies/:id"
        description="Single company with score history (last 30 snapshots) and counts."
        example={`{
  "id": "cmowunl4v01jq...",
  "name": "PFIZER INC",
  "ticker": null,
  "jurisdiction": null,
  "caseCount": 57,
  "latestScore": { "score": 100, "band": "high", "computedAt": "2026-05-08T..." },
  "scoreHistory": [{ "at": "...", "score": 100, "band": "high" }, ...]
}`}
      />

      <Endpoint
        method="GET"
        path="/api/companies/:id/cases"
        description="All cases (dockets) linked to this company, most-recent-filed first."
        example={`{
  "cases": [
    {
      "id": "cmowsem...",
      "caseName": "RAVE INC. v. APPLE INC.",
      "court": "njd",
      "docketNumber": "2:26-cv-05128",
      "dateFiled": "2026-05-07T00:00:00.000Z",
      "natureOfSuit": "410 Anti-Trust",
      "judge": "Julien Xavier Neals",
      "role": "defendant"
    }
  ]
}`}
      />

      <Endpoint
        method="GET"
        path="/api/companies/:id/risk"
        description="Latest risk snapshot in the v3 contract. The shape varies by version: v1 returns 3 breakdown factors, v2 returns 6, v3 returns 7 (adds judge)."
        params={[
          { name: "history", desc: "If `true`, returns the last N snapshots instead of the latest single one" },
          { name: "limit", desc: "When `history=true`, cap on snapshots returned (default 90, max 365)" },
          { name: "version", desc: "Pin to `v1` / `v2` / `v3`. Default returns the latest version available." },
        ]}
        example={`{
  "score": 100,
  "band": "high",
  "computed_at": "2026-05-08T10:48:32.123Z",
  "version": "v3.0",
  "change": { "delta_7d": null, "delta_30d": null },
  "drivers": [
    {
      "type": "case_spike",
      "label": "Spike in filings: 8 cases vs 2.4/mo baseline",
      "weight": 0.83,
      "evidence": { "recent30": 8, "baseline_monthly": 2.4 }
    }
  ],
  "breakdown": {
    "volume": 1.0,
    "recency": 1.0,
    "severity": 0.31,
    "momentum": 1.0,
    "concentration": 0.93,
    "jurisdiction": 1.05,
    "judge": 1.0
  },
  "benchmark": null,
  "sources": [
    {
      "name": "CourtListener / Free Law Project",
      "license": "CC BY-ND 4.0",
      "url": "https://www.courtlistener.com/"
    }
  ]
}`}
      />

      <Endpoint
        method="GET"
        path="/api/search"
        description="Search companies by name (case-insensitive substring)."
        params={[{ name: "q", desc: "Query string (≤ 100 chars)" }]}
        example={`{
  "results": [
    { "id": "cmow...", "name": "PFIZER INC", "ticker": null, "score": 100, "band": "high" }
  ]
}`}
      />

      <Endpoint
        method="GET"
        path="/api/alerts"
        description="Most recent alerts across the watched universe."
        example={`{
  "alerts": [
    {
      "id": "almk...",
      "companyId": "cmow...",
      "type": "case_spike",
      "severity": "warn",
      "title": "Spike in filings: 8 cases in last 30 days",
      "body": "...",
      "createdAt": "2026-05-08T..."
    }
  ]
}`}
      />

      <Endpoint
        method="GET"
        path="/api/dashboard"
        description="Aggregated dashboard payload — totals, top risk, trending, recent alerts, biggest movers — in a single round-trip."
        example={`{
  "totals": { "companies": 396, "cases": 1000, "alerts": 5 },
  "topRisk": [{ "id": "...", "name": "PFIZER INC", "score": 100, "band": "high" }, ...],
  "trending": [...],
  "recentAlerts": [...],
  "movers": [...]
}`}
      />

      <Panel title="Coming soon" subtitle="Tracked in the platform-shell milestone">
        <ul className="space-y-2 text-sm leading-relaxed">
          <Bullet>API tokens with per-key rate limits</Bullet>
          <Bullet>Webhook delivery for new alerts</Bullet>
          <Bullet>Streaming risk-snapshot diffs over server-sent events</Bullet>
          <Bullet>Embeddable widget for partner integrations (KYB platforms)</Bullet>
        </ul>
      </Panel>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-fg/80">
      <span className="text-muted/60 select-none mt-2">·</span>
      <span className="flex-1">{children}</span>
    </li>
  );
}

function Endpoint({
  method,
  path,
  description,
  params,
  example,
}: {
  method: string;
  path: string;
  description: string;
  params?: Array<{ name: string; desc: string }>;
  example: string;
}) {
  return (
    <Panel
      title={path}
      subtitle={description}
      right={
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase rounded-md border border-accent/40 bg-accent/10 text-accent px-2 py-0.5">
          {method}
        </span>
      }
    >
      <div className="space-y-4">
        {params && params.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted mb-2">
              Query parameters
            </div>
            <ul className="space-y-1.5 text-sm">
              {params.map((p) => (
                <li key={p.name} className="grid grid-cols-[100px_1fr] gap-3">
                  <code className="font-mono text-[11px] tabular text-fg/90">{p.name}</code>
                  <span className="text-muted text-xs leading-relaxed">{p.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted mb-2">
            <Code2 className="size-3" />
            <span>Response (200)</span>
          </div>
          <pre className="font-mono text-[12px] leading-relaxed bg-panel2/60 border border-border rounded-lg p-4 overflow-x-auto">
            {example}
          </pre>
        </div>
      </div>
    </Panel>
  );
}
