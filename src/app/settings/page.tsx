import Link from "next/link";
import { CheckCircle2, LayoutDashboard, ListChecks } from "lucide-react";

export const dynamic = "force-dynamic";

const workspaces = [
  {
    name: "Analyst workspace",
    href: "/",
    status: "Default",
    description: "Dense dashboard, full company profiles, alerts, calibration, API docs, and source-level detail.",
    icon: <LayoutDashboard className="size-4" />,
    active: true,
  },
  {
    name: "Brief workspace",
    href: "/brief",
    status: "Optional",
    description: "Portfolio queue, sector map, and short company profiles for quick review sessions.",
    icon: <ListChecks className="size-4" />,
    active: false,
  },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 animate-fade-in">
      <header className="border-b border-border pb-6">
        <div className="text-xs uppercase tracking-[0.18em] text-muted">Settings</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Workspace</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Choose how you enter LexPulse. Analyst remains the default product flow; Brief is available
          when you want a short portfolio review.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {workspaces.map((workspace) => (
          <Link
            key={workspace.name}
            href={workspace.href}
            className="group rounded-xl border border-border bg-panel/60 p-5 transition hover:border-accent/50 hover:bg-panel/80"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg border border-border bg-panel2 text-muted group-hover:text-accent">
                  {workspace.icon}
                </span>
                <div>
                  <h2 className="text-base font-semibold">{workspace.name}</h2>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">{workspace.status}</p>
                </div>
              </div>
              {workspace.active && <CheckCircle2 className="size-5 text-ok" aria-label="Current default" />}
            </div>
            <p className="mt-5 text-sm leading-6 text-muted">{workspace.description}</p>
            <div className="mt-5 text-xs font-medium uppercase tracking-[0.16em] text-fg/70 group-hover:text-accent">
              Open {workspace.name.replace(" workspace", "")}
            </div>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-panel/60 p-5">
        <h2 className="text-sm font-semibold">Preference behavior</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          The home route opens Analyst for everyone. Brief does not replace the default route, so shared
          links and production bookmarks keep the full workflow intact.
        </p>
      </section>
    </div>
  );
}
