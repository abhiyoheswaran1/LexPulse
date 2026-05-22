import { describe, expect, test } from "vitest";
import { isTrustedMutationOrigin, rejectCrossOriginMutation } from "@/lib/request-security";

describe("request security", () => {
  test("allows same-origin mutation requests", () => {
    const req = new Request("https://lexpulse.example/api/workspace", {
      method: "PUT",
      headers: { origin: "https://lexpulse.example", "sec-fetch-site": "same-origin" },
    });

    expect(isTrustedMutationOrigin(req)).toBe(true);
    expect(rejectCrossOriginMutation(req)).toBeNull();
  });

  test("allows Vercel forwarded host origins", () => {
    const req = new Request("http://127.0.0.1/api/workspace", {
      method: "PATCH",
      headers: {
        origin: "https://lex-pulse-six.vercel.app",
        "x-forwarded-host": "lex-pulse-six.vercel.app",
        "x-forwarded-proto": "https",
      },
    });

    expect(isTrustedMutationOrigin(req)).toBe(true);
  });

  test("rejects cross-site mutation requests", () => {
    const req = new Request("https://lexpulse.example/api/workspace", {
      method: "PUT",
      headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
    });

    expect(isTrustedMutationOrigin(req)).toBe(false);
    expect(rejectCrossOriginMutation(req)?.status).toBe(403);
  });
});
