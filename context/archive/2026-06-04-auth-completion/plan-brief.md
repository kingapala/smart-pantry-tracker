# Auth Completion (FR-013) — Plan Brief

> Full plan: `context/changes/auth-completion/plan.md`

## What & Why

Implement FR-013: password reset via email. This is the last must-have auth requirement before MVP — without it, accounts are permanently inaccessible on password loss. Sign-out (FR-003) is already wired in the baseline; this slice adds only the reset flow.

## Starting Point

Auth pages (`signin`, `signup`, `confirm-email`), API routes (`signin.ts`, `signup.ts`, `signout.ts`), and reusable form components (`FormField`, `PasswordToggle`, `SubmitButton`, `ServerError`) all exist. The sign-in page has no "Forgot password?" link; there is no reset-request, token-exchange, or update-password route.

## Desired End State

A user who has forgotten their password clicks "Forgot password?" on the sign-in page, enters their email, receives a reset link by email, clicks the link, sets a new password, and lands on `/inventory` as a logged-in user. Failed or reused links show a clear `/auth/auth-error` page with a link to request a new one. The update-password page is protected — unauthenticated direct access redirects to sign-in.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Post-update redirect | `/inventory` | User already has a valid session after token exchange — send them straight into the app, consistent with signin.ts | Plan |
| Reset success UX | Dedicated `/auth/reset-email-sent` page | Consistent with how signup success is handled via `confirm-email.astro`; prevents accidental resubmission | Plan |
| Token failure UX | Dedicated `/auth/auth-error` page | User gets a clear explanation and a "Request new link" action rather than a confusing error on the sign-in form | Plan |
| "Forgot password?" link placement | Below password field in `SignInForm.tsx` | Industry-standard placement; users look for it next to the password field | Plan |
| No new npm packages | Reuse existing Supabase + components | All methods needed (`resetPasswordForEmail`, `verifyOtp`, `updateUser`) are in the already-installed `@supabase/supabase-js` | Research |
| Confirm route location | `src/pages/auth/confirm.ts` (not under `/api/`) | URL must be `/auth/confirm` to match the Supabase email template convention from the Astro quickstart | Research |

## Scope

**In scope:**
- "Forgot password?" link on sign-in page
- Forgot-password form page + API route
- "Check your email" success page
- `/auth/confirm` token-exchange GET route
- `/auth/auth-error` error page
- Update-password form page + API route
- Middleware update: protect `/auth/update-password`
- Supabase dashboard: update Password Reset email template

**Out of scope:**
- Rate-limiting UI (Supabase enforces server-side)
- "Current password" field (not needed for reset flow)
- Changes to sign-up, sign-in, or sign-out flows beyond the "Forgot password?" link
- Supabase SMTP configuration (hosted defaults work for MVP)

## Architecture / Approach

Follows the existing pattern exactly: `.astro` page → React form (`client:load`) → POST API route → redirect. The one deviation is the confirm callback, which is a GET route (email link) at `src/pages/auth/confirm.ts`. The 3-step session ordering is: `resetPasswordForEmail` → `verifyOtp` (establishes session in cookies) → `updateUser`. The first two steps are in separate routes and cannot be combined.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Reset request flow | Forgot-password form, API route, success page, "Forgot password?" link | Supabase may not deliver email in dev without SMTP config — verify via dashboard event log |
| 2. Confirm + update flow | Token-exchange route, auth-error page, update-password form + API, middleware update | `updateUser` hangs without prior `verifyOtp` — confirm route must be wired first |
| 3. Email template + E2E | Supabase email template updated; full flow verified end-to-end | Wrong `{{ .SiteURL }}` or template URL mismatch sends email links to 404 |

**Prerequisites:** None — S-01 has no roadmap prerequisites.
**Estimated effort:** ~1-2 focused sessions across 3 phases.

## Open Risks & Assumptions

- Supabase hosted email delivery works in the target environment without custom SMTP (assumed true for MVP; verify by checking a reset email arrives)
- The "Site URL" in Supabase Authentication → URL Configuration matches the app's URL — must be set correctly for `{{ .SiteURL }}` in the email template to resolve

## Success Criteria (Summary)

- User can complete the full password reset flow end-to-end using a real email
- Reusing a reset link shows `/auth/auth-error` (single-use token)
- Direct access to `/auth/update-password` without a session redirects to sign-in
