"use client";

import { Search, X } from "lucide-react";
import { useWorkflowState } from "./useWorkflowState";

export function SavedSearches({ currentQuery }: { currentQuery: string }) {
  const workflow = useWorkflowState();
  const trimmed = currentQuery.trim();
  const alreadySaved = workflow.state.savedSearches.some(
    (search) => search.query.toLowerCase() === trimmed.toLowerCase(),
  );

  return (
    <section className="rounded-xl border border-border bg-panel/60">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Saved searches</h2>
          <p className="mt-0.5 text-xs text-muted">Synced to this account workspace.</p>
        </div>
        <button
          type="button"
          disabled={!trimmed || alreadySaved}
          onClick={() => workflow.saveSearch(trimmed)}
          className="rounded-md border border-border px-3 py-2 text-xs text-muted transition hover:border-accent/60 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save current
        </button>
      </header>

      {workflow.state.savedSearches.length === 0 ? (
        <div className="px-5 py-6 text-sm text-muted">No saved searches yet.</div>
      ) : (
        <ul className="divide-y divide-border">
          {workflow.state.savedSearches.map((search) => (
            <li key={search.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <a href={`/search?q=${encodeURIComponent(search.query)}`} className="flex min-w-0 items-center gap-2 text-sm hover:text-accent">
                <Search className="size-3.5 shrink-0 text-muted" />
                <span className="truncate">{search.query}</span>
              </a>
              <button
                type="button"
                onClick={() => workflow.removeSearch(search.id)}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-panel2 hover:text-fg"
                aria-label={`Remove ${search.query}`}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
