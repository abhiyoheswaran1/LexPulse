"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useWorkflowState } from "./useWorkflowState";
import { cn } from "@/lib/utils";

export function WatchlistButton({
  id,
  name,
  ticker,
  compact = false,
}: {
  id: string;
  name: string;
  ticker?: string | null;
  compact?: boolean;
}) {
  const workflow = useWorkflowState();
  const watched = workflow.isWatched(id);
  const Icon = watched ? BookmarkCheck : Bookmark;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        workflow.toggleCompany({ id, name, ticker });
      }}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border text-xs font-medium transition hover:border-accent/60 hover:text-accent",
        watched ? "bg-accent/10 text-accent" : "bg-panel/60 text-muted",
        compact ? "px-2 py-1" : "px-3 py-2",
      )}
      aria-pressed={watched}
    >
      <Icon className="size-3.5" />
      {compact ? (watched ? "Saved" : "Watch") : watched ? "In watchlist" : "Add to watchlist"}
    </button>
  );
}
