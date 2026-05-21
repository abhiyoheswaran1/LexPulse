"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { formatRelative } from "@/lib/utils";

type Health = {
  ok: boolean;
  latestScoreAt: string | null;
  database: { latencyMs: number };
};

export function StatusPill({ light = false }: { light?: boolean }) {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: Health) => {
        if (!cancelled) setHealth(payload);
      })
      .catch(() => {
        if (!cancelled) setHealth({ ok: false, latestScoreAt: null, database: { latencyMs: 0 } });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const label = health?.ok ? "Live" : "Check";
  const detail = health?.latestScoreAt ? formatRelative(new Date(health.latestScoreAt)) : "status";

  return (
    <Link
      href="/status"
      className={
        light
          ? "inline-flex items-center gap-2 rounded-full border border-[hsl(35_24%_80%)] px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.16em] text-[hsl(33_14%_43%)] transition hover:border-[hsl(34_82%_34%)] hover:text-[hsl(34_82%_34%)]"
          : "inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.16em] text-muted transition hover:border-accent/60 hover:text-accent"
      }
      title={health ? `Health query ${health.database.latencyMs}ms, latest score ${detail}` : "Loading platform status"}
    >
      <span className="relative flex size-1.5">
        <span className={`absolute inline-flex h-full w-full rounded-full ${health?.ok === false ? "bg-bad" : "bg-accent"} opacity-60 ${health?.ok === false ? "" : "animate-ping"}`} />
        <span className={`relative inline-flex size-1.5 rounded-full ${health?.ok === false ? "bg-bad" : "bg-accent"}`} />
      </span>
      <span>{label}</span>
      <Activity className="size-3" />
    </Link>
  );
}
