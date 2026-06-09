<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Shopping List Check-Off Implementation Plan

- **Plan**: context/changes/shopping-list-complete/plan.md
- **Mode**: Deep
- **Date**: 2026-06-08
- **Verdict**: SOUND (post-triage: F1 fixed, F2 acknowledged)
- **Findings**: 0 critical, 1 warning, 1 observation — all triaged

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

9/9 paths ✓, line refs ✓ (164-188, 191-241, 233-239, 170-173, 181-186 all verified exact against `src/pages/shopping-list/index.astro`), brief↔plan ✓. Progress section mirrors Success Criteria verbatim (1.1-1.9, 2.1-2.9). "No atomic increment exists anywhere" claim confirmed via full-codebase sweep (zero `.rpc()`, triggers, `GREATEST`, or `quantity = quantity + x` patterns). `products.quantity` schema claim (`numeric(10,2) not null default 0 check (quantity >= 0)`) confirmed exactly at `supabase/migrations/20260528000000_products_schema.sql:5`.

## Findings

### F1 — New endpoint's "mirror this file exactly" citation is wrong, and contradicts itself

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1, §1 "Check-off API endpoint" — Contract (plan.md:69)
- **Detail**: The contract tells the implementer to mirror `src/pages/api/products/[id].ts:8-50` "exactly for the auth check ... and response shape (raw Response with HTTP status — 204 success, 401/503/404/500 + error text on failure — never a redirect)".

  But `products/[id].ts` does NOT do this — its `!user` branch is `return context.redirect("/auth/signin")` (a redirect), not a 401 Response. "Mirror X exactly" and "never redirect" directly conflict for that file's auth-check branch.

  The 401-raw-Response shape the plan actually describes lives in a DIFFERENT, more recently-shipped, more locally-relevant sibling instead: `src/pages/api/shopping-list-items/[id].ts:6-7` — `return new Response("Unauthorized", { status: 401 })` — which is also fully self-consistent end-to-end (401/503/500/204, plain-string error bodies, no redirects anywhere in the file).

  A sub-agent swept all 6 `src/pages/api/**` route files and confirmed this isn't a one-off slip: three different auth/error-response conventions coexist (`context.redirect`, raw `new Response(..., {status})`, and `encodeURIComponent`-wrapped bodies), and even `products/[id].ts` itself is internally inconsistent — it redirects on auth failure but uses raw `encodeURIComponent`-wrapped Responses for other errors. The implementer has no single clean convention to copy unless pointed at the right one.
- **Fix**: Change the mirror citation in plan.md:69 from `src/pages/api/products/[id].ts:8-50` to `src/pages/api/shopping-list-items/[id].ts:6-22` — it's the only sibling that's both (a) fully self-consistent with the exact shape the plan already describes (raw 401/503/500/204 Responses, never a redirect) and (b) the most directly analogous precedent (same feature area, same fetch()-driven single-resource DELETE shape the new POST endpoint's response handling should match).
- **Decision**: FIXED — citation swapped to `src/pages/api/shopping-list-items/[id].ts:6-22` in plan.md:69

### F2 — The qty-purchased dialog is a genuinely novel UI pattern with nothing to model after

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Architectural Fitness
- **Location**: Phase 1, §2 "Shopping list page — pantry check-off UI"
- **Detail**: Confirmed via sweep: the only existing "edit a quantity" UI in the app is the full-page inventory edit form (`inventory/[id]/edit.astro:80-87`) — a plain pre-filled `<input type="number">`. There's no stepper or increment-by-amount dialog anywhere to model the new "enter how much you bought" dialog after. Not a flaw — the plan already made and justified this exact tradeoff (empty input + placeholder hint, validated by `new.astro`'s `min`/`step` pattern, and the user explicitly chose this UX via AskUserQuestion). Flagging only so the implementer knows this specific dialog shape is "first of its kind" — slightly raises the bar on getting its copy/focus/validation right since there's no sibling to lean on if something looks off mid-build.
- **Fix**: No fix needed — informational only.
- **Decision**: ACKNOWLEDGED — no plan change; noted for the implementer as a heads-up
