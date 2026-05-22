import { describe, expect, test } from "vitest";
import { normalizeAccountIdentity } from "@/lib/account";

describe("account identity helpers", () => {
  test("normalizes account and workspace identity input", () => {
    expect(
      normalizeAccountIdentity({
        email: "  Investor@Example.COM ",
        name: "  Dana  Patel ",
        workspaceName: "  Litigation desk  ",
      }),
    ).toEqual({
      email: "investor@example.com",
      name: "Dana Patel",
      workspaceName: "Litigation desk",
    });
  });

  test("treats empty identity fields as unset", () => {
    expect(normalizeAccountIdentity({ email: " ", name: "", workspaceName: "\n" })).toEqual({
      email: null,
      name: null,
      workspaceName: null,
    });
  });
});
