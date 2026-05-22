import { NextResponse } from "next/server";

const SAFE_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

export function rejectCrossOriginMutation(req: Request) {
  if (!isTrustedMutationOrigin(req)) {
    return NextResponse.json({ error: "Cross-origin mutation requests are not allowed." }, { status: 403 });
  }
  return null;
}

export function isTrustedMutationOrigin(req: Request) {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && !SAFE_FETCH_SITES.has(fetchSite)) return false;

  const origin = req.headers.get("origin");
  if (!origin) return true;

  const requestUrl = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
  const forwardedOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : null;

  return origin === requestUrl.origin || origin === forwardedOrigin;
}
