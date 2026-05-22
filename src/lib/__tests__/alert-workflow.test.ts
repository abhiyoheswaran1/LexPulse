import { describe, expect, test } from "vitest";
import { groupAlertThreads } from "@/lib/alert-workflow";

describe("alert workflow helpers", () => {
  test("groups repeated company/type alerts into a latest-first thread", () => {
    const grouped = groupAlertThreads([
      { id: "old", type: "case_spike", company: { id: "co_1" }, createdAt: "2026-05-21T10:00:00.000Z" },
      { id: "latest", type: "case_spike", company: { id: "co_1" }, createdAt: "2026-05-22T10:00:00.000Z" },
      { id: "other", type: "risk_jump", company: { id: "co_1" }, createdAt: "2026-05-22T09:00:00.000Z" },
    ]);

    expect(grouped).toEqual([
      {
        key: "co_1:case_spike",
        primary: { id: "latest", type: "case_spike", company: { id: "co_1" }, createdAt: "2026-05-22T10:00:00.000Z" },
        alerts: [
          { id: "latest", type: "case_spike", company: { id: "co_1" }, createdAt: "2026-05-22T10:00:00.000Z" },
          { id: "old", type: "case_spike", company: { id: "co_1" }, createdAt: "2026-05-21T10:00:00.000Z" },
        ],
      },
      {
        key: "co_1:risk_jump",
        primary: { id: "other", type: "risk_jump", company: { id: "co_1" }, createdAt: "2026-05-22T09:00:00.000Z" },
        alerts: [{ id: "other", type: "risk_jump", company: { id: "co_1" }, createdAt: "2026-05-22T09:00:00.000Z" }],
      },
    ]);
  });
});
