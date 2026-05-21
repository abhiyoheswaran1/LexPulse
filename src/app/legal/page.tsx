export default function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-fade-in">
      <header className="border-b border-border pb-6">
        <div className="text-xs uppercase tracking-[0.18em] text-muted">Legal</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Terms and privacy</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          LexPulse is litigation intelligence software, not legal advice. Scores are analytical signals derived from public data.
        </p>
      </header>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LegalCard
          title="Terms"
          text="Use LexPulse as a decision-support product. Do not treat scores, alerts, or summaries as dispositive legal findings."
        />
        <LegalCard
          title="Privacy"
          text="Workspace preferences, watchlists, saved searches, reviewed alerts, API keys, and notes are stored for the active account workspace."
        />
      </section>
    </div>
  );
}

function LegalCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel/60 p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
    </div>
  );
}
