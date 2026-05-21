import { describe, expect, test } from "vitest";
import { isDisplayableEntityName } from "@/lib/entity-display";

describe("entity display filtering", () => {
  test("keeps normal company names visible", () => {
    expect(isDisplayableEntityName("Apple Inc.")).toBe(true);
    expect(isDisplayableEntityName("JPMORGAN CHASE BANK, N.A.")).toBe(true);
    expect(isDisplayableEntityName("Meta Platforms, Inc.")).toBe(true);
  });

  test("hides procedural search-warrant artifacts from dashboard company lists", () => {
    expect(
      isDisplayableEntityName(
        "Information associated with Apple ID moneysigns1000@gmail.com that is stored at premises controlled by Apple Inc",
      ),
    ).toBe(false);
    expect(
      isDisplayableEntityName(
        "Sealed Search Warrant and Application for Order Commanding Apple Inc. not to Notify any Person",
      ),
    ).toBe(false);
    expect(
      isDisplayableEntityName(
        "Facebook Username: juanmanuel.navarro.3956 Facebook User ID Number: 100006783793156 stored at premises controlled by Meta Platforms, Inc.",
      ),
    ).toBe(false);
    expect(isDisplayableEntityName("THE SMALL BUSINESS BANKING DEPARTMENT OF THE BANK OF AMERICA")).toBe(false);
  });
});
