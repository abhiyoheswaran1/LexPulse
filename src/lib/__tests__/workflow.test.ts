import { describe, expect, test } from "vitest";
import {
  addSavedSearch,
  markAlertRead,
  markAlertUnread,
  parseWorkflowState,
  removeWatchlistCompany,
  toggleWatchlistCompany,
  type WorkflowState,
} from "@/lib/workflow";

const empty: WorkflowState = {
  version: 1,
  watchlist: [],
  savedSearches: [],
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

  test("marks alerts read and unread without duplicating IDs", () => {
    const read = markAlertRead(markAlertRead(empty, "alert_1"), "alert_1");
    expect(read.readAlertIds).toEqual(["alert_1"]);
    expect(markAlertUnread(read, "alert_1").readAlertIds).toEqual([]);
  });
});
