"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();

  useEffect(() => {
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message, digest: error.digest, path: pathname }),
    }).catch(() => undefined);
  }, [error, pathname]);

  return (
    <div className="rounded-xl border border-bad/30 bg-bad/10 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
        <div>
          <h1 className="text-lg font-semibold text-fg">This view could not load</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            LexPulse could not load the current data view. Retry the request; if it persists, the backing data service may be unavailable.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-4 rounded-md border border-border px-3 py-2 text-sm text-muted transition hover:border-accent/60 hover:text-accent"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
