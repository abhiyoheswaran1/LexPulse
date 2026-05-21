export const WORKFLOW_STORAGE_KEY = "lexpulse.workflow.v1";

export type StoredCompany = {
  id: string;
  name: string;
  ticker?: string | null;
  savedAt: string;
};

export type SavedSearch = {
  id: string;
  query: string;
  createdAt: string;
};

export type SavedAlertFilter = {
  id: string;
  name: string;
  filters: {
    impact: string;
    sector: string;
    type: string;
    read: string;
    company: string;
    watchlistOnly: boolean;
  };
  createdAt: string;
};

export type WorkflowState = {
  version: 1;
  watchlist: StoredCompany[];
  savedSearches: SavedSearch[];
  savedAlertFilters: SavedAlertFilter[];
  readAlertIds: string[];
};

export const EMPTY_WORKFLOW_STATE: WorkflowState = {
  version: 1,
  watchlist: [],
  savedSearches: [],
  savedAlertFilters: [],
  readAlertIds: [],
};

export function parseWorkflowState(value: string | null): WorkflowState {
  if (!value) return EMPTY_WORKFLOW_STATE;

  try {
    const parsed = JSON.parse(value) as Partial<WorkflowState>;
    if (!Array.isArray(parsed.watchlist) || !Array.isArray(parsed.savedSearches) || !Array.isArray(parsed.readAlertIds)) {
      return EMPTY_WORKFLOW_STATE;
    }

    return {
      version: 1,
      watchlist: parsed.watchlist.filter(isStoredCompany),
      savedSearches: parsed.savedSearches.filter(isSavedSearch),
      savedAlertFilters: Array.isArray(parsed.savedAlertFilters)
        ? parsed.savedAlertFilters.filter(isSavedAlertFilter)
        : [],
      readAlertIds: parsed.readAlertIds.filter((id): id is string => typeof id === "string"),
    };
  } catch {
    return EMPTY_WORKFLOW_STATE;
  }
}

export function serializeWorkflowState(state: WorkflowState): string {
  return JSON.stringify(state);
}

export function toggleWatchlistCompany(
  state: WorkflowState,
  company: Omit<StoredCompany, "savedAt"> & { savedAt?: string },
): WorkflowState {
  if (state.watchlist.some((item) => item.id === company.id)) {
    return removeWatchlistCompany(state, company.id);
  }

  const savedAt = company.savedAt ?? new Date().toISOString();
  return {
    ...state,
    watchlist: [
      {
        id: company.id,
        name: company.name,
        ticker: company.ticker ?? null,
        savedAt,
      },
      ...state.watchlist,
    ],
  };
}

export function removeWatchlistCompany(state: WorkflowState, companyId: string): WorkflowState {
  return {
    ...state,
    watchlist: state.watchlist.filter((company) => company.id !== companyId),
  };
}

export function addSavedSearch(
  state: WorkflowState,
  search: Omit<SavedSearch, "query" | "createdAt"> & { query: string; createdAt?: string },
): WorkflowState {
  const query = normalizeVisibleQuery(search.query);
  if (!query) return state;

  const exists = state.savedSearches.some((item) => normalizeSearchKey(item.query) === normalizeSearchKey(query));
  if (exists) return state;

  return {
    ...state,
    savedSearches: [
      {
        id: search.id,
        query,
        createdAt: search.createdAt ?? new Date().toISOString(),
      },
      ...state.savedSearches,
    ],
  };
}

export function removeSavedSearch(state: WorkflowState, id: string): WorkflowState {
  return {
    ...state,
    savedSearches: state.savedSearches.filter((search) => search.id !== id),
  };
}

export function addSavedAlertFilter(
  state: WorkflowState,
  filter: Omit<SavedAlertFilter, "name" | "createdAt"> & { name: string; createdAt?: string },
): WorkflowState {
  const name = normalizeVisibleQuery(filter.name);
  if (!name) return state;

  return {
    ...state,
    savedAlertFilters: [
      {
        id: filter.id,
        name,
        filters: filter.filters,
        createdAt: filter.createdAt ?? new Date().toISOString(),
      },
      ...state.savedAlertFilters.filter((item) => normalizeSearchKey(item.name) !== normalizeSearchKey(name)),
    ].slice(0, 12),
  };
}

export function removeSavedAlertFilter(state: WorkflowState, id: string): WorkflowState {
  return {
    ...state,
    savedAlertFilters: state.savedAlertFilters.filter((filter) => filter.id !== id),
  };
}

export function markAlertRead(state: WorkflowState, alertId: string): WorkflowState {
  if (state.readAlertIds.includes(alertId)) return state;
  return {
    ...state,
    readAlertIds: [...state.readAlertIds, alertId],
  };
}

export function markAlertUnread(state: WorkflowState, alertId: string): WorkflowState {
  return {
    ...state,
    readAlertIds: state.readAlertIds.filter((id) => id !== alertId),
  };
}

export function markAlertsRead(state: WorkflowState, alertIds: string[]): WorkflowState {
  const next = new Set(state.readAlertIds);
  for (const id of alertIds) next.add(id);
  return {
    ...state,
    readAlertIds: [...next],
  };
}

function normalizeVisibleQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function normalizeSearchKey(query: string): string {
  return normalizeVisibleQuery(query).toLowerCase();
}

function isStoredCompany(value: unknown): value is StoredCompany {
  if (!value || typeof value !== "object") return false;
  const candidate = value as StoredCompany;
  return typeof candidate.id === "string" && typeof candidate.name === "string" && typeof candidate.savedAt === "string";
}

function isSavedSearch(value: unknown): value is SavedSearch {
  if (!value || typeof value !== "object") return false;
  const candidate = value as SavedSearch;
  return typeof candidate.id === "string" && typeof candidate.query === "string" && typeof candidate.createdAt === "string";
}

function isSavedAlertFilter(value: unknown): value is SavedAlertFilter {
  if (!value || typeof value !== "object") return false;
  const candidate = value as SavedAlertFilter;
  const filters = candidate.filters;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.createdAt === "string" &&
    !!filters &&
    typeof filters === "object" &&
    typeof filters.impact === "string" &&
    typeof filters.sector === "string" &&
    typeof filters.type === "string" &&
    typeof filters.read === "string" &&
    typeof filters.company === "string" &&
    typeof filters.watchlistOnly === "boolean"
  );
}
