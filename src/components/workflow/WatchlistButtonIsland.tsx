"use client";

import dynamic from "next/dynamic";

const WatchlistButton = dynamic(() => import("./WatchlistButton").then((module) => module.WatchlistButton), {
  ssr: false,
  loading: () => null,
});

export function WatchlistButtonIsland({
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
  return <WatchlistButton id={id} name={name} ticker={ticker} compact={compact} />;
}
