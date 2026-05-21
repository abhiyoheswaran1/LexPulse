"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_WORKFLOW_STATE,
  WORKFLOW_STORAGE_KEY,
  addSavedAlertFilter,
  addSavedSearch,
  markAlertRead,
  markAlertUnread,
  markAlertsRead,
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

export function useWorkflowState() {
  const [state, setState] = useState<WorkflowState>(EMPTY_WORKFLOW_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(readState());
    setReady(true);

    const sync = () => setState(readState());
    window.addEventListener("storage", sync);
    window.addEventListener(WORKFLOW_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(WORKFLOW_EVENT, sync);
    };
  }, []);

  const update = useCallback((next: WorkflowState) => {
    setState(next);
    window.localStorage.setItem(WORKFLOW_STORAGE_KEY, serializeWorkflowState(next));
    window.dispatchEvent(new Event(WORKFLOW_EVENT));
  }, []);

  return useMemo(
    () => ({
      state,
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
    }),
    [ready, state, update],
  );
}

function readState(): WorkflowState {
  if (typeof window === "undefined") return EMPTY_WORKFLOW_STATE;
  return parseWorkflowState(window.localStorage.getItem(WORKFLOW_STORAGE_KEY));
}

export type { SavedAlertFilter, SavedSearch, StoredCompany };
