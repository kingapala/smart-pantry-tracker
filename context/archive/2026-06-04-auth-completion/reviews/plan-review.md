<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Auth Completion (FR-013)

- **Plan**: `context/changes/auth-completion/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-04
- **Verdict**: SOUND (after fixes)
- **Findings**: 1 critical, 1 warning, 1 observation — all fixed

## Verdicts

| Dimension | Verdict |
|---|---|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL → PASS (F1 fixed) |
| Plan Completeness | WARNING → PASS (F2, F3 fixed) |

## Grounding

5/5 paths ✓, 3/3 symbols confirmed, brief↔plan ✓. `PROTECTED_ROUTES` is module-local (no blast radius). `FormField.tsx:44` confirms `name={name ?? id}`. Cookie+redirect pattern proven by `signout.ts`. GET handler outside `/api/` is valid Astro routing. No auth-scoped layout or directory-level guards.

## Findings

### F1 — Open redirect via unvalidated `next` param in confirm route

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is a single guard line, no design rethink
- **Dimension**: Blind Spots
- **Location**: Phase 2, Change 1 — confirm callback route (Contract section)
- **Detail**: Plan specified "Redirects to `next` on success" with no validation. Attacker obtains valid token_hash for their own account, crafts `/auth/confirm?token_hash=<valid>&type=recovery&next=https://evil.com`, victim clicks it, verifyOtp succeeds, victim redirected to attacker-controlled URL.
- **Fix**: Added `const safeNext = next?.startsWith("/") ? next : "/auth/update-password";` guard to confirm route contract; redirect to `safeNext` instead of `next` directly.
- **Decision**: FIXED

### F2 — Supabase Site URL prerequisite buried in prose, not in Phase 3 checklist

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3, Change 1 — email template Contract
- **Detail**: Site URL check ("verify Supabase Authentication → URL Configuration → Site URL matches the app's URL") was prose-only. Supabase default is `localhost:3000`; Astro runs on `:4321`. Mismatch causes every reset link to 404 silently.
- **Fix**: Added explicit manual verification step before item 3.1 in Phase 3 success criteria, and added `- [ ] 3.0` entry in Progress section.
- **Decision**: FIXED

### F3 — `FormField` `name ?? id` default — plan contract misleads about server submission

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is a contract wording update
- **Dimension**: Plan Completeness
- **Location**: Phase 2, Change 3 — UpdatePasswordForm contract
- **Detail**: Plan said "confirm field has no `name` so it is not sent to the server." `FormField.tsx:44` does `name={name ?? id}` — omitting `name` still renders `name="confirmPassword"` on the input. Value IS posted; server ignores it. Wording would mislead implementer into avoiding `FormField`.
- **Fix**: Updated contract to: "The confirm field value is ignored server-side — use `FormField` with any `id` (it will be submitted but unused), matching the `SignUpForm.tsx` pattern."
- **Decision**: FIXED
