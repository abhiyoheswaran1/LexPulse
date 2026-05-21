import Link from "next/link";

export default function AttributionPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-fade-in">
      <header className="border-b border-border pb-6">
        <div className="text-xs uppercase tracking-[0.18em] text-muted">Data attribution</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sources and coverage</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          LexPulse links source records wherever possible so analysts can inspect the underlying dockets.
        </p>
      </header>
      <section className="rounded-xl border border-border bg-panel/60 p-5">
        <h2 className="text-sm font-semibold">CourtListener / Free Law Project</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Federal docket metadata is sourced from CourtListener and the Free Law Project, with public docket links shown on case and alert surfaces when available.
        </p>
        <Link
          href="https://www.courtlistener.com/"
          className="mt-4 inline-flex rounded-md border border-border px-3 py-2 text-sm text-muted transition hover:border-accent/60 hover:text-accent"
        >
          Open CourtListener
        </Link>
      </section>
    </div>
  );
}
