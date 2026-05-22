"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { Panel } from "@/components/Panel";

const DashboardPersonalization = dynamic(
  () => import("./DashboardPersonalization").then((module) => module.DashboardPersonalization),
  {
    ssr: false,
    loading: () => (
      <Panel title="My portfolio" subtitle="Loading account workspace.">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Reading saved workspace.
        </div>
      </Panel>
    ),
  },
);

export function DashboardPersonalizationIsland() {
  return <DashboardPersonalization />;
}
