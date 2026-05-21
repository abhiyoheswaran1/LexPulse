"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspacePreference } from "@/lib/account";
import {
  EMPTY_WORKFLOW_STATE,
  WORKFLOW_STORAGE_KEY,
  addSavedAlertFilter,
  addSavedSearch,
  markAlertRead,
  markAlertUnread,
  markAlertsRead,
  mergeWorkflowStates,
  parseWorkflowState,
  removeSavedSearch,
  removeSavedAlertFilter,
  removeWatchlistCompany,
  serializeWorkflowState,
  toggleWatchlistCompany,
  type SavedSearch,
  type SavedAlertFilter,
  type StoredCompany,
  type WorkflowState,
} from "@/lib/workflow";

const WORKFLOW_EVENT = "lexpulse-workflow";
const PREFERENCE_STORAGE_KEY = "lexpulse.preference.v1";
const DEFAULT_PREFERENCE: WorkspacePreference = {
  defaultWorkspace: "analyst",
  onboardingComplete: false,
  digestFrequency: "daily",
  digestChannel: "none",
  alertThreshold: "review",
};

export function useWorkflowState() {
  const [state, setState] = useState<WorkflowState>(EMPTY_WORKFLOW_STATE);
  const [preference, setPreferenceState] = useState<WorkspacePreference>(DEFAULT_PREFERENCE);
  const [ready, setReady] = useState(false);
  const serverReady = useRef(false);

  useEffect(() => {
    const local = readState();
    const localPreference = readPreference();
    setState(local);
    setPreferenceState(localPreference);
    setReady(true);
    let cancelled = false;

    fetch("/api/workspace", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { workflow?: WorkflowState; preference?: WorkspacePreference }) => {
        if (cancelled) return;
        const remote = parseWorkflowState(JSON.stringify(payload.workflow ?? EMPTY_WORKFLOW_STATE));
        const merged = mergeWorkflowStates(local, remote);
        const nextPreference = normalizePreference({ ...(payload.preference ?? DEFAULT_PREFERENCE), ...localPreference });
        setState(merged);
        setPreferenceState(nextPreference);
        writeLocal(merged);
        writePreference(nextPreference);
        serverReady.current = true;
        if (serializeWorkflowState(merged) !== serializeWorkflowState(remote)) {
          void persistServer(merged, nextPreference);
        }
      })
      .catch(() => {
        serverReady.current = false;
      });

    const sync = () => setState(readState());
    window.addEventListener("storage", sync);
    window.addEventListener(WORKFLOW_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(WORKFLOW_EVENT, sync);
      cancelled = true;
    };
  }, []);

  const update = useCallback((next: WorkflowState, nextPreference = preference) => {
    setState(next);
    writeLocal(next);
    window.dispatchEvent(new Event(WORKFLOW_EVENT));
    void persistServer(next, nextPreference);
  }, [preference]);

  const updatePreference = useCallback((next: Partial<WorkspacePreference>) => {
    setPreferenceState((current) => {
      const merged = normalizePreference({ ...current, ...next });
      writePreference(merged);
      void persistServer(readState(), merged);
      return merged;
    });
  }, []);

  return useMemo(
    () => ({
      state,
      preference,
      ready,
      isWatched: (companyId: string) => state.watchlist.some((company) => company.id === companyId),
      toggleCompany: (company: Omit<StoredCompany, "savedAt">) => update(toggleWatchlistCompany(state, company)),
      removeCompany: (companyId: string) => update(removeWatchlistCompany(state, companyId)),
      saveSearch: (query: string) =>
        update(
          addSavedSearch(state, {
            id: `search_${Date.now()}`,
            query,
          }),
        ),
      removeSearch: (id: string) => update(removeSavedSearch(state, id)),
      saveAlertFilter: (filter: Omit<SavedAlertFilter, "createdAt">) => update(addSavedAlertFilter(state, filter)),
      removeAlertFilter: (id: string) => update(removeSavedAlertFilter(state, id)),
      isAlertRead: (alertId: string) => state.readAlertIds.includes(alertId),
      markRead: (alertId: string) => update(markAlertRead(state, alertId)),
      markUnread: (alertId: string) => update(markAlertUnread(state, alertId)),
      markManyRead: (alertIds: string[]) => update(markAlertsRead(state, alertIds)),
      setPreference: updatePreference,
    }),
    [preference, ready, state, update, updatePreference],
  );
}

function readState(): WorkflowState {
  if (typeof window === "undefined") return EMPTY_WORKFLOW_STATE;
  return parseWorkflowState(window.localStorage.getItem(WORKFLOW_STORAGE_KEY));
}

function writeLocal(state: WorkflowState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKFLOW_STORAGE_KEY, serializeWorkflowState(state));
}

function readPreference(): WorkspacePreference {
  if (typeof window === "undefined") return DEFAULT_PREFERENCE;
  try {
    return normalizePreference(JSON.parse(window.localStorage.getItem(PREFERENCE_STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function writePreference(preference: WorkspacePreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(preference));
}

async function persistServer(workflow: WorkflowState, preference: WorkspacePreference) {
  await fetch("/api/workspace", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow, preference }),
  }).catch(() => undefined);
}

function normalizePreference(value: unknown): WorkspacePreference {
  const preference = value as Partial<WorkspacePreference> | null | undefined;
  return {
    defaultWorkspace: preference?.defaultWorkspace === "brief" ? "brief" : "analyst",
    onboardingComplete: Boolean(preference?.onboardingComplete),
    digestFrequency:
      preference?.digestFrequency === "off" || preference?.digestFrequency === "weekly"
        ? preference.digestFrequency
        : "daily",
    digestChannel:
      preference?.digestChannel === "email" || preference?.digestChannel === "slack"
        ? preference.digestChannel
        : "none",
    alertThreshold:
      preference?.alertThreshold === "monitor" || preference?.alertThreshold === "all"
        ? preference.alertThreshold
        : "review",
  };
}

export type { SavedAlertFilter, SavedSearch, StoredCompany };
