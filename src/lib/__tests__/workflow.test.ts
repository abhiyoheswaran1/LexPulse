import { describe, expect, test } from "vitest";
import {
  addSavedAlertFilter,
  addSavedSearch,
  markAlertRead,
  markAlertUnread,
  markAlertsUnread,
  mergeWorkflowStates,
  parseWorkflowState,
  removeWatchlistCompany,
  toggleWatchlistCompany,
  type WorkflowState,
} from "@/lib/workflow";

const empty: WorkflowState = {
  version: 1,
  watchlist: [],
  savedSearches: [],
  savedAlertFilters: [],
  readAlertIds: [],
};

describe("workflow state helpers", () => {
  test("parses missing or malformed storage into an empty state", () => {
    expect(parseWorkflowState(null)).toEqual(empty);
    expect(parseWorkflowState("{bad json")).toEqual(empty);
    expect(parseWorkflowState(JSON.stringify({ watchlist: "wrong" }))).toEqual(empty);
  });

  test("toggles watchlist companies without duplicates", () => {
    const added = toggleWatchlistCompany(empty, {
      id: "co_1",
      name: "Acme Corp",
      ticker: "ACME",
      savedAt: "2026-05-21T00:00:00.000Z",
    });

    expect(added.watchlist).toEqual([
      { id: "co_1", name: "Acme Corp", ticker: "ACME", savedAt: "2026-05-21T00:00:00.000Z" },
    ]);

    expect(toggleWatchlistCompany(added, { id: "co_1", name: "Acme Corp" }).watchlist).toEqual([]);
  });

  test("removes a company from a watchlist", () => {
    const state = toggleWatchlistCompany(empty, { id: "co_1", name: "Acme Corp" });
    expect(removeWatchlistCompany(state, "co_1").watchlist).toEqual([]);
  });

  test("adds saved searches with stable dedupe by normalized query", () => {
    const first = addSavedSearch(empty, {
      id: "search_1",
      query: " Apple ",
      createdAt: "2026-05-21T00:00:00.000Z",
    });
    const duplicate = addSavedSearch(first, {
      id: "search_2",
      query: "apple",
      createdAt: "2026-05-21T00:01:00.000Z",
    });

    expect(duplicate.savedSearches).toEqual([
      { id: "search_1", query: "Apple", createdAt: "2026-05-21T00:00:00.000Z" },
    ]);
  });

  test("adds saved alert filters with normalized name replacement", () => {
    const first = addSavedAlertFilter(empty, {
      id: "filter_1",
      name: " Watchlist Review ",
      createdAt: "2026-05-21T00:00:00.000Z",
      filters: {
        impact: "review",
        sector: "all",
        type: "all",
        read: "unread",
        company: "",
        watchlistOnly: true,
      },
    });
    const replaced = addSavedAlertFilter(first, {
      id: "filter_2",
      name: "watchlist review",
      createdAt: "2026-05-21T00:01:00.000Z",
      filters: {
        impact: "monitor",
        sector: "tech",
        type: "case_spike",
        read: "all",
        company: "Apple",
        watchlistOnly: false,
      },
    });

    expect(replaced.savedAlertFilters).toEqual([
      {
        id: "filter_2",
        name: "watchlist review",
        createdAt: "2026-05-21T00:01:00.000Z",
        filters: {
          impact: "monitor",
          sector: "tech",
          type: "case_spike",
          read: "all",
          company: "Apple",
          watchlistOnly: false,
        },
      },
    ]);
  });

  test("marks alerts read and unread without duplicating IDs", () => {
    const read = markAlertRead(markAlertRead(empty, "alert_1"), "alert_1");
    expect(read.readAlertIds).toEqual(["alert_1"]);
    expect(markAlertUnread(read, "alert_1").readAlertIds).toEqual([]);
  });

  test("reopens many reviewed alerts at once", () => {
    const read: WorkflowState = {
      ...empty,
      readAlertIds: ["alert_1", "alert_2", "alert_3"],
    };

    expect(markAlertsUnread(read, ["alert_1", "alert_3"]).readAlertIds).toEqual(["alert_2"]);
  });

  test("merges local and remote workflow state for account sync", () => {
    const local: WorkflowState = {
      version: 1,
      watchlist: [{ id: "co_1", name: "Local Co", savedAt: "2026-05-21T01:00:00.000Z" }],
      savedSearches: [{ id: "search_local", query: "Apple", createdAt: "2026-05-21T01:00:00.000Z" }],
      savedAlertFilters: [],
      readAlertIds: ["alert_1"],
    };
    const remote: WorkflowState = {
      version: 1,
      watchlist: [
        { id: "co_1", name: "Remote Co", savedAt: "2026-05-21T00:00:00.000Z" },
        { id: "co_2", name: "Remote Two", savedAt: "2026-05-21T00:00:00.000Z" },
      ],
      savedSearches: [{ id: "search_remote", query: "apple", createdAt: "2026-05-21T00:00:00.000Z" }],
      savedAlertFilters: [
        {
          id: "filter_remote",
          name: "Review",
          createdAt: "2026-05-21T00:00:00.000Z",
          filters: { impact: "review", sector: "all", type: "all", read: "all", company: "", watchlistOnly: false },
        },
      ],
      readAlertIds: ["alert_2"],
    };

    expect(mergeWorkflowStates(local, remote)).toEqual({
      version: 1,
      watchlist: [
        { id: "co_1", name: "Local Co", savedAt: "2026-05-21T01:00:00.000Z" },
        { id: "co_2", name: "Remote Two", savedAt: "2026-05-21T00:00:00.000Z" },
      ],
      savedSearches: [{ id: "search_local", query: "Apple", createdAt: "2026-05-21T01:00:00.000Z" }],
      savedAlertFilters: [
        {
          id: "filter_remote",
          name: "Review",
          createdAt: "2026-05-21T00:00:00.000Z",
          filters: { impact: "review", sector: "all", type: "all", read: "all", company: "", watchlistOnly: false },
        },
      ],
      readAlertIds: ["alert_2", "alert_1"],
    });
  });
});
