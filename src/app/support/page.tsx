import Link from "next/link";

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-fade-in">
      <header className="border-b border-border pb-6">
        <div className="text-xs uppercase tracking-[0.18em] text-muted">Support</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Contact and escalation</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Operational and data-quality support for LexPulse workspaces.
        </p>
      </header>
      <section className="rounded-xl border border-border bg-panel/60 p-5">
        <h2 className="text-sm font-semibold">Production support</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Use the platform status page first for freshness and coverage checks. For source or entity-resolution issues,
          include the company, docket link, and the expected correction.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/status" className="rounded-md border border-border px-3 py-2 text-sm text-muted transition hover:border-accent/60 hover:text-accent">
            Platform status
          </Link>
          <Link href="/attribution" className="rounded-md border border-border px-3 py-2 text-sm text-muted transition hover:border-accent/60 hover:text-accent">
            Data attribution
          </Link>
        </div>
      </section>
    </div>
  );
}
