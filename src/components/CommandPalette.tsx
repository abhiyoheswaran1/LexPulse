"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Bookmark,
  Briefcase,
  ClipboardList,
  Command,
  Activity,
  LayoutDashboard,
  Loader2,
  Save,
  Search,
  Settings,
} from "lucide-react";
import { RiskBadge } from "./RiskBadge";
import { useWorkflowState } from "./workflow/useWorkflowState";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  name: string;
  ticker?: string | null;
  caseCount: number;
  score: number;
  band: string;
  recentCases: number;
  delta7d: number | null;
};

type CommandItem = {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  action: () => void;
};

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const workflow = useWorkflowState();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
      if (event.key === "Escape") onOpenChange(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open || trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as { results?: SearchResult[] };
        setResults(payload.results ?? []);
      } catch (error) {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [open, trimmed]);

  const closeAndGo = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: "dashboard",
        label: "Open dashboard",
        hint: "Analyst workspace",
        icon: <LayoutDashboard className="size-4" />,
        action: () => closeAndGo("/"),
      },
      {
        id: "alerts",
        label: "Open alerts",
        hint: "Filter and review litigation signals",
        icon: <Bell className="size-4" />,
        action: () => closeAndGo("/alerts"),
      },
      {
        id: "workflow",
        label: "Open daily workflow",
        hint: "Review portfolio changes, notes, and watched alerts",
        icon: <ClipboardList className="size-4" />,
        action: () => closeAndGo("/workflow"),
      },
      {
        id: "watchlist",
        label: "Go to watchlist",
        hint: `${workflow.state.watchlist.length.toLocaleString()} saved companies`,
        icon: <Bookmark className="size-4" />,
        action: () => closeAndGo("/watchlist"),
      },
      {
        id: "search",
        label: "Open company search",
        hint: "Find a company by name",
        icon: <Search className="size-4" />,
        action: () => closeAndGo(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search"),
      },
      {
        id: "settings",
        label: "Switch workspace",
        hint: "Choose Analyst or Brief",
        icon: <Settings className="size-4" />,
        action: () => closeAndGo("/settings"),
      },
      {
        id: "brief",
        label: "Open Brief workspace",
        hint: "Fast review interface",
        icon: <Briefcase className="size-4" />,
        action: () => closeAndGo("/brief"),
      },
      {
        id: "status",
        label: "Open platform status",
        hint: "Data freshness, coverage, uptime, integrations",
        icon: <Activity className="size-4" />,
        action: () => closeAndGo("/status"),
      },
    ],
    [trimmed, workflow.state.watchlist.length],
  );

  const saveSearch = () => {
    if (!trimmed) return;
    workflow.saveSearch(trimmed);
    onOpenChange(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-bg/75 px-3 py-14 backdrop-blur-sm sm:px-6" role="dialog" aria-modal="true">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-border bg-panel shadow-2xl shadow-black/30">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Command className="size-4 text-accent" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search companies or run a command"
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-fg placeholder:text-muted/70 focus:outline-none"
          />
          {loading && <Loader2 className="size-4 animate-spin text-muted" />}
          <span className="hidden rounded-md border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted sm:inline">
            Esc
          </span>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-3">
          <div className="mb-2 px-2 text-[10px] uppercase tracking-[0.14em] text-muted">Commands</div>
          <div className="grid gap-1">
            {commands.map((command) => (
              <button
                key={command.id}
                type="button"
                onClick={command.action}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-panel2"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-panel2/60 text-muted">
                  {command.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg">{command.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{command.hint}</span>
                </span>
              </button>
            ))}
            {trimmed && (
              <button
                type="button"
                onClick={saveSearch}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-panel2"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-panel2/60 text-muted">
                  <Save className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg">Save search</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{trimmed}</span>
                </span>
              </button>
            )}
          </div>

          <div className="mt-4 px-2 text-[10px] uppercase tracking-[0.14em] text-muted">Companies</div>
          <div className="mt-2 grid gap-1">
            {trimmed.length < 2 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-5 text-sm text-muted">
                Type at least two characters to search company records.
              </div>
            ) : results.length === 0 && !loading ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-5 text-sm text-muted">
                No companies matched this query.
              </div>
            ) : (
              results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => closeAndGo(`/companies/${result.id}`)}
                  className={cn(
                    "flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left transition hover:bg-panel2",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{result.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {result.caseCount.toLocaleString()} cases, {result.recentCases.toLocaleString()} recent
                    </span>
                  </span>
                  <RiskBadge score={result.score} band={result.band} />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
