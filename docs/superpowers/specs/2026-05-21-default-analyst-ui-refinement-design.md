# Default Analyst UI Refinement Design

**Date:** 2026-05-21
**Decision:** Keep the existing dense LexPulse interface as the default product experience. Rename the alternate simplified workspace to Brief in visible UI. Move interface switching out of the home page and into Settings.

## Goal

Refine the default LexPulse flow so it feels like a useful litigation operations product, not a generated landing page. The default Analyst workspace remains at `/`, `/search`, `/alerts`, and `/companies/[id]`. The Brief workspace remains available for lower-friction review, but switching between workspaces belongs in Settings.

## Product Shape

- Default workspace: Analyst. Dense, dark, data-first, and fully functional.
- Alternate workspace: Brief. Quieter portfolio-review flow for fast triage.
- Settings route: `/settings`, the only visible place where users switch workspace styles.
- Legacy route compatibility: existing `/simple` links continue to work, but visible labels say Brief.
- No side-by-side interface comparison in the main flow.

## Analyst Enhancements

The default dashboard should absorb the useful Brief concepts:

- Portfolio attention counts: Review now, Monitor, Quiet.
- Priority queue rows with score, cases, recent cases, and a plain-language reason.
- Sector concentration summary.
- Alert impact grouping in the alerts feed.
- Company profile review summary using the same deterministic reason helper.
- Search results with attention status and reason, not score alone.

## Visual Direction

Keep the dark Analyst surface, but make it more utilitarian:

- Replace the oversized editorial hero with a compact workspace header.
- Reduce italic editorial copy and decorative language.
- Keep cards only for panels that frame real tools or repeated data.
- Use restrained status pills and table-like rows.
- Avoid gradient text, side stripes, nested cards, and generic marketing copy.

## Testing And Verification

- Add a shared helper for alert impact classification and test it first.
- Keep existing attention helper tests passing.
- Run `npm test`, `npm run typecheck`, and `npm run build`.
- Verify `/`, `/settings`, `/search`, `/alerts`, `/companies/[id]`, and `/simple` or `/brief` in a browser before deployment.
