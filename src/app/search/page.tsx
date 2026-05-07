"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Panel } from "@/components/Panel";
import { RiskBadge } from "@/components/RiskBadge";

type Result = { id: string; name: string; caseCount: number; score: number; band: string };

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const json = await r.json();
        setResults(json.results ?? []);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted mt-1">Find a company. Variants like &ldquo;Acme Inc.&rdquo; and &ldquo;ACME Corporation&rdquo; resolve to the same record.</p>
      </header>

      <div className="relative">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company name…"
          className="w-full bg-panel border border-border rounded-md pl-9 pr-3 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-accent/60"
        />
      </div>

      <Panel>
        {q.trim() === "" ? (
          <div className="text-sm text-muted py-6 text-center">Start typing to search.</div>
        ) : loading ? (
          <div className="text-sm text-muted py-6 text-center">Searching…</div>
        ) : results.length === 0 ? (
          <div className="text-sm text-muted py-6 text-center">No matches.</div>
        ) : (
          <ul className="divide-y divide-border -mx-5">
            {results.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/companies/${r.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-panel2/60"
                >
                  <div>
                    <div className="text-sm font-medium">{r.name}</div>
                    <div className="text-xs text-muted">{r.caseCount} cases on record</div>
                  </div>
                  <RiskBadge score={r.score} band={r.band} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
