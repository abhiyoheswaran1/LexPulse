"use client";

import { useEffect, useState } from "react";
import { Copy, CreditCard, KeyRound, ShieldCheck, Slack, Trash2 } from "lucide-react";
import { useWorkflowState } from "@/components/workflow/useWorkflowState";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function PlatformSettings() {
  const workflow = useWorkflowState();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [keyName, setKeyName] = useState("Production API");
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [loadingKeys, setLoadingKeys] = useState(true);

  useEffect(() => {
    void refreshKeys();
  }, []);

  const refreshKeys = async () => {
    setLoadingKeys(true);
    try {
      const response = await fetch("/api/platform/keys", { cache: "no-store" });
      const payload = (await response.json()) as { keys?: ApiKeyRow[] };
      setKeys(payload.keys ?? []);
    } finally {
      setLoadingKeys(false);
    }
  };

  const createKey = async () => {
    const response = await fetch("/api/platform/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: keyName }),
    });
    const payload = (await response.json()) as { key?: ApiKeyRow & { secret?: string } };
    if (payload.key?.secret) setNewSecret(payload.key.secret);
    await refreshKeys();
  };

  const revokeKey = async (id: string) => {
    await fetch(`/api/platform/keys/${id}`, { method: "DELETE" });
    await refreshKeys();
  };

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-border bg-panel/60">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Account persistence</h2>
          <p className="mt-1 text-xs text-muted">Watchlists, saved searches, reviewed alerts, digest preferences, and workspace settings sync to this account workspace.</p>
        </header>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
          <PreferenceSelect
            label="Default workspace"
            value={workflow.preference.defaultWorkspace}
            onChange={(value) => workflow.setPreference({ defaultWorkspace: value as "analyst" | "brief" })}
            options={[
              ["analyst", "Analyst"],
              ["brief", "Brief"],
            ]}
          />
          <PreferenceSelect
            label="Digest frequency"
            value={workflow.preference.digestFrequency}
            onChange={(value) => workflow.setPreference({ digestFrequency: value as "off" | "daily" | "weekly" })}
            options={[
              ["daily", "Daily"],
              ["weekly", "Weekly"],
              ["off", "Off"],
            ]}
          />
          <PreferenceSelect
            label="Digest channel"
            value={workflow.preference.digestChannel}
            onChange={(value) => workflow.setPreference({ digestChannel: value as "none" | "email" | "slack" })}
            options={[
              ["none", "In app"],
              ["email", "Email"],
              ["slack", "Slack"],
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-border bg-panel/60">
          <header className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold">API keys</h2>
              <p className="mt-1 text-xs text-muted">Create, rotate, and revoke platform keys. Newly created secrets are shown once.</p>
            </div>
            <div className="flex gap-2">
              <input
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                className="w-44 rounded-md border border-border bg-panel2/60 px-3 py-2 text-sm outline-none focus:border-accent/60"
                aria-label="API key name"
              />
              <button
                type="button"
                onClick={createKey}
                className="inline-flex items-center gap-2 rounded-md border border-accent/50 bg-accent px-3 py-2 text-sm font-medium text-bg transition hover:bg-accent/90"
              >
                <KeyRound className="size-4" />
                Create
              </button>
            </div>
          </header>
          {newSecret && (
            <div className="border-b border-border bg-accent/10 px-5 py-4">
              <div className="text-xs font-medium text-accent">New secret, shown once</div>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(newSecret)}
                className="mt-2 flex w-full items-center justify-between gap-3 rounded-md border border-accent/30 bg-panel/80 px-3 py-2 font-mono text-xs text-fg"
              >
                <span className="truncate">{newSecret}</span>
                <Copy className="size-3.5 shrink-0 text-muted" />
              </button>
            </div>
          )}
          <div className="divide-y divide-border">
            {loadingKeys ? (
              <div className="px-5 py-6 text-sm text-muted">Loading API keys...</div>
            ) : keys.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted">No API keys yet.</div>
            ) : (
              keys.map((key) => (
                <div key={key.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-medium">{key.name}</div>
                    <div className="mt-1 font-mono text-xs text-muted">
                      {key.prefix}... · {key.revokedAt ? "revoked" : "active"}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(key.revokedAt)}
                    onClick={() => revokeKey(key.id)}
                    className="inline-flex w-fit items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted transition hover:border-bad/60 hover:text-bad disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" />
                    Revoke
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-panel/60 p-5">
          <h2 className="text-sm font-semibold">Platform readiness</h2>
          <div className="mt-4 space-y-3">
            <ReadinessItem icon={<ShieldCheck className="size-4" />} title="Reliability" text="Status endpoint, error capture, and live data freshness checks are active." />
            <ReadinessItem icon={<Slack className="size-4" />} title="Digest channels" text="Slack and email are enabled when provider environment variables are configured." />
            <ReadinessItem icon={<CreditCard className="size-4" />} title="Billing gates" text="Plan metadata and API-key surfaces are ready; Stripe keys activate billing integrations." />
          </div>
        </section>
      </div>
    </section>
  );
}

function PreferenceSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-panel2/60 px-3 py-2 text-sm text-fg outline-none focus:border-accent/60"
      >
        {options.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReadinessItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-panel2/35 p-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-border text-accent">{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted">{text}</span>
      </span>
    </div>
  );
}
