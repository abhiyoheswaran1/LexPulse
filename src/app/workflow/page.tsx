import { DailyWorkflow } from "@/components/platform/DailyWorkflow";

export const dynamic = "force-dynamic";

export default function WorkflowPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <header className="border-b border-border pb-6">
        <div className="text-xs uppercase tracking-[0.18em] text-muted">Daily workflow</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Portfolio desk</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Start here for watched companies, new movement, unread portfolio alerts, and review notes.
        </p>
      </header>

      <DailyWorkflow />
    </div>
  );
}
