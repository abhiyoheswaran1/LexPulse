import { randomUUID } from "crypto";

export async function captureErrorMessage(
  message: string,
  context: { level?: "error" | "warning" | "info"; tags?: Record<string, string>; extra?: Record<string, unknown> } = {},
) {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  const endpoint = sentryEnvelopeEndpoint(dsn);
  if (!endpoint) return;

  const eventId = randomUUID().replace(/-/g, "");
  const sentAt = new Date().toISOString();
  const payload = [
    JSON.stringify({ event_id: eventId, dsn, sent_at: sentAt }),
    JSON.stringify({ type: "event" }),
    JSON.stringify({
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "javascript",
      level: context.level ?? "error",
      message,
      tags: context.tags,
      extra: context.extra,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    }),
  ].join("\n");

  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-sentry-envelope" },
    body: payload,
  }).catch(() => undefined);
}

function sentryEnvelopeEndpoint(dsn: string) {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+/, "").split("/").pop();
    if (!projectId) return null;
    return `${url.protocol}//${url.host}/api/${projectId}/envelope/`;
  } catch {
    return null;
  }
}
