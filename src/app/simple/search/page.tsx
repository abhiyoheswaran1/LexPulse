"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { attentionLabel, attentionLevel, attentionReason } from "@/lib/simple-ui";
import {
  AttentionPill,
  SimpleActionLink,
  SimpleCard,
  SimplePageHeader,
} from "@/components/simple/SimpleUI";

type Result = { id: string; name: string; caseCount: number; score: number; band: string };

export default function SimpleSearchPage() {
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
    <div className="space-y-8">
      <SimplePageHeader
        eyebrow="Simple search"
        title="Find a company brief"
        description="Search for a company, then open the simplified brief first. The Advanced profile remains available from every brief."
        action={<SimpleActionLink href="/search">Advanced search</SimpleActionLink>}
      />

      <div className="relative">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[hsl(33_14%_43%)]" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company name..."
          className="w-full rounded-lg border border-[hsl(35_24%_76%)] bg-[hsl(42_44%_97%)] py-3 pl-11 pr-4 text-sm text-[hsl(34_24%_14%)] placeholder:text-[hsl(33_14%_50%)] transition focus:border-[hsl(34_82%_34%)] focus:outline-none"
        />
      </div>

      <SimpleCard>
        {q.trim() === "" ? (
          <EmptyState>Start typing to find a company brief.</EmptyState>
        ) : loading ? (
          <EmptyState>Searching...</EmptyState>
        ) : results.length === 0 ? (
          <EmptyState>No matches.</EmptyState>
        ) : (
          <ul className="divide-y divide-[hsl(35_24%_84%)]">
            {results.map((r) => {
              const level = attentionLevel({ score: r.score, band: r.band });
              return (
                <li key={r.id}>
                  <Link
                    href={`/simple/companies/${r.id}`}
                    className="block px-5 py-4 transition hover:bg-[hsl(38_48%_92%)]"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold text-[hsl(34_24%_14%)]">{r.name}</h2>
                          <AttentionPill level={level} label={attentionLabel(level)} />
                        </div>
                        <p className="mt-1 text-sm text-[hsl(33_14%_36%)]">
                          {attentionReason({ score: r.score, band: r.band })}
                        </p>
                        <p className="mt-1 text-xs text-[hsl(33_14%_43%)]">
                          {r.caseCount.toLocaleString()} cases on record
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <div className="font-mono text-2xl font-semibold text-[hsl(34_24%_14%)]">{r.score}</div>
                        <div className="text-xs uppercase tracking-[0.16em] text-[hsl(33_14%_43%)]">{r.band}</div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SimpleCard>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-[hsl(33_14%_43%)]">{children}</div>;
}
