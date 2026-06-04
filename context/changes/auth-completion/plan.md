# Auth Completion (FR-013) Implementation Plan

## Overview

Implement FR-013: password reset via email. Sign-out (FR-003) is already fully wired in the baseline. The work is a 3-step Supabase PKCE-style flow: user requests a reset → Supabase sends an email with a token-hash link → the app exchanges the token for a session and lets the user set a new password.

## Current State Analysis

Sign-in, sign-up, and sign-out are all implemented. The auth UI pattern is established: an `.astro` page renders a React form component with `client:load`; the form POSTs to an API route under `src/pages/api/auth/`; the API route calls `createClient()`, null-checks it, calls the Supabase method, and redirects with `?error=` on failure or to the next page on success.

Reusable components already in `src/components/auth/`: `FormField`, `PasswordToggle`, `SubmitButton`, `ServerError`. All new forms use these directly.

`@supabase/ssr` is at `^0.10.3` — the `type=recovery` verifyOtp bug (v0.4.0) is fixed. No new npm packages needed. No database or schema changes.

### Key Discoveries:

- `createClient()` signature in this project: `createClient(context.request.headers, context.cookies)` — not `{ request, cookies }` as shown in Supabase docs
- `PROTECTED_ROUTES` in `src/middleware.ts:4` is an array literal — append `/auth/update-password` there
- All auth pages use the same card layout (`bg-cosmic`, `max-w-sm`, `rounded-2xl`, `border-white/10`, `bg-white/10`, `backdrop-blur-xl`) — copy this exactly

## Desired End State

A user who has lost their password can recover their account end-to-end:

1. Click "Forgot password?" on the sign-in page → fill in email → land on a "check your email" page
2. Click the link in the email → session established → land on "update password" page
3. Enter and confirm new password → redirected to `/inventory` as a logged-in user

The sign-in page has a "Forgot password?" link below the password field. Failed token exchanges (expired or tampered links) show `/auth/auth-error` with a link to request a new reset. The update-password page is protected — direct access without a session redirects to sign-in.

### Key Discoveries (cont.)

- confirm route must live at `src/pages/auth/confirm.ts` (not under `/api/`), so its URL is `/auth/confirm`. The Supabase email template will link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password`. If placed under `/api/`, the email template URL must be updated to match — keeping it at `/auth/confirm` follows the Supabase Astro quickstart convention and avoids confusion.
- `updateUser({ password })` hangs indefinitely without a prior `verifyOtp` session. The confirm route is not optional — it is the step that establishes the authenticated session the update route depends on.

## What We're NOT Doing

- No rate-limiting UI (Supabase enforces its own email rate limits on the server)
- No "current password" field on the update-password form (user is unauthenticated pre-reset; Supabase's `updateUser` does not require it)
- No changes to sign-up, sign-in, or sign-out flows beyond adding the "Forgot password?" link
- No server-side confirm-password validation (client validates match; Supabase returns an error for short passwords)
- No Supabase SMTP configuration (hosted Supabase's default email delivery is sufficient for MVP)

## Implementation Approach

Follow the established codebase pattern exactly: new `.astro` page → React form component (`client:load`) → POST API route → redirect. The confirm route is a GET endpoint (email link callback) and is the only route that deviates from POST — it lives at `src/pages/auth/confirm.ts` so its URL is `/auth/confirm`.

## Critical Implementation Details

**Route placement for `/auth/confirm`:** The confirm callback must be at `src/pages/auth/confirm.ts` (not `src/pages/api/auth/confirm.ts`). The Supabase email template uses `{{ .SiteURL }}/auth/confirm?...` as the link URL — if the file is placed under `/api/`, the email link will 404.

**Session ordering:** `verifyOtp` in the confirm route establishes the session that `/api/auth/update-password` depends on. These two steps cannot be combined or reordered — the confirm route must complete and redirect before the update-password page loads.

---

## Phase 1: Reset request flow

### Overview

Creates the entry point for the password reset flow: the "Forgot password?" link on the sign-in page, the forgot-password form page, the API route that sends the reset email, and the "check your email" success page.

### Changes Required:

#### 1. ForgotPasswordForm React component

**File**: `src/components/auth/ForgotPasswordForm.tsx`

**Intent**: Client-side form with a single email field. Validates email format before submitting. Follows the exact shape of `SignInForm.tsx` but with only one field. POSTs to `/api/auth/reset-password`.

**Contract**: Props `{ serverError?: string | null }`. Uses `FormField`, `SubmitButton`, `ServerError`. Email field: `id="email"`, `name="email"`, `type="email"`. Submit button text: "Send reset link", pending text: "Sending...".

#### 2. Forgot-password page

**File**: `src/pages/auth/forgot-password.astro`

**Intent**: Public page (no auth redirect). Renders `ForgotPasswordForm` with `client:load` and passes `?error` from the URL. Styled identically to `signin.astro` (same card layout). Heading: "Reset your password". Link back to `/auth/signin` below the form.

**Contract**: `const error = Astro.url.searchParams.get("error")`. No `Astro.locals.user` redirect — users who need to reset their password are not logged in.

#### 3. Reset-password API route

**File**: `src/pages/api/auth/reset-password.ts`

**Intent**: Reads the `email` form field, calls `supabase.auth.resetPasswordForEmail(email)`, redirects to `/auth/reset-email-sent` on success or back to `/auth/forgot-password?error=...` on failure.

**Contract**: `export const POST: APIRoute`. Null-checks `createClient()`. Does not pass `redirectTo` to `resetPasswordForEmail` — the email template constructs the full URL using `{{ .SiteURL }}` and `{{ .TokenHash }}`.

#### 4. Reset-email-sent page

**File**: `src/pages/auth/reset-email-sent.astro`

**Intent**: Static success page shown after a valid email is submitted. Tells the user to check their inbox. No form. Mirrors the style of `confirm-email.astro`. Link to `/auth/signin`.

**Contract**: No dynamic data needed. Heading: "Check your email". Body: "We've sent a password reset link to your email address. Click it to set a new password."

#### 5. "Forgot password?" link in SignInForm

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Add a small right-aligned "Forgot password?" link immediately below the password `FormField` block (before `ServerError`). Styled like the "Don't have an account?" links: `text-sm text-purple-300 hover:underline`.

**Contract**: Rendered as a `<div className="text-right"><a href="/auth/forgot-password" ...>Forgot password?</a></div>` between the password `FormField` and `ServerError`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with no errors across all new and modified files
- `npx astro check` (or `npx astro sync && npm run build`) completes without TypeScript errors

#### Manual Verification:

- `/auth/signin` shows "Forgot password?" link below the password field; link navigates to `/auth/forgot-password`
- `/auth/forgot-password` renders the email form; submitting an empty or invalid email shows a client-side error without a page reload
- Submitting a valid email navigates to `/auth/reset-email-sent` and shows the "check your email" message
- Supabase dashboard → Authentication → Users shows a password recovery event for the submitted email (confirms the API call reached Supabase)
- Submitting with Supabase unconfigured (or intentionally misconfigured) shows the error message on the forgot-password page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Confirm callback + update-password flow

### Overview

Creates the token-exchange callback route (the link in the reset email lands here), the auth-error page for bad tokens, the update-password form page, its React component, and the API route that calls `updateUser`. Updates middleware to protect the update-password page.

### Changes Required:

#### 1. Confirm callback route

**File**: `src/pages/auth/confirm.ts`

**Intent**: GET endpoint that receives `token_hash` and `type` from the email link query string, calls `verifyOtp` to establish a session, and redirects to the `next` param (defaulting to `/auth/update-password`). Redirects to `/auth/auth-error` if the token is missing, invalid, or expired.

**Contract**: `export const GET: APIRoute`. Reads `token_hash`, `type` (`EmailOtpType` from `@supabase/supabase-js`), and `next` from `new URL(context.request.url).searchParams`. Calls `createClient(context.request.headers, context.cookies)` — same signature as all other routes. Calls `supabase.auth.verifyOtp({ token_hash, type })`. Before redirecting on success, validate `next` is a same-origin relative path to prevent open-redirect attacks: `const safeNext = next?.startsWith("/") ? next : "/auth/update-password";` — redirect to `safeNext`, never to `next` directly. Redirects to `/auth/auth-error` on any error or missing params.

#### 2. Auth-error page

**File**: `src/pages/auth/auth-error.astro`

**Intent**: Static error page shown when token exchange fails. Explains the link is invalid or expired. Provides two exits: "Request a new reset link" → `/auth/forgot-password`, and "Back to sign in" → `/auth/signin`. Same card layout as all auth pages.

**Contract**: No dynamic data. Heading: "Reset link invalid". Body: "This password reset link has expired or has already been used. Request a new one below."

#### 3. UpdatePasswordForm React component

**File**: `src/components/auth/UpdatePasswordForm.tsx`

**Intent**: Form with password and confirm-password fields (both with `PasswordToggle`). Client-side validates: both required, password ≥ 6 characters, passwords match. POSTs only `password` to `/api/auth/update-password` (confirm-password is client-only). Follows the shape of the password section of `SignUpForm.tsx`.

**Contract**: Props `{ serverError?: string | null }`. Uses `FormField`, `PasswordToggle`, `SubmitButton`, `ServerError`. `name="password"` on the password field only; the confirm field value is ignored server-side — use `FormField` with any `id` (it will be submitted but unused), matching the `SignUpForm.tsx` pattern. Submit text: "Update password", pending: "Updating...".

#### 4. Update-password page

**File**: `src/pages/auth/update-password.astro`

**Intent**: Protected page that renders `UpdatePasswordForm`. The middleware handles the auth guard (redirect to sign-in if no session). Reads `?error` from URL. Same card layout as other auth pages. Heading: "Set new password".

**Contract**: `const error = Astro.url.searchParams.get("error")`. Renders `<UpdatePasswordForm serverError={error} client:load />`. No manual auth redirect in the page frontmatter — middleware covers it.

#### 5. Update-password API route

**File**: `src/pages/api/auth/update-password.ts`

**Intent**: Reads the `password` form field, calls `supabase.auth.updateUser({ password })`, redirects to `/inventory` on success or back to `/auth/update-password?error=...` on failure.

**Contract**: `export const POST: APIRoute`. Null-checks `createClient()`. Redirects to `/auth/update-password?error=${encodeURIComponent("Supabase is not configured")}` if client is null.

#### 6. Protect update-password route in middleware

**File**: `src/middleware.ts`

**Intent**: Add `/auth/update-password` to `PROTECTED_ROUTES` so unauthenticated users trying to access the page directly are redirected to sign-in.

**Contract**: Append `"/auth/update-password"` to the `PROTECTED_ROUTES` array at line 4.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with no new errors
- `npx astro check` (or build) completes without TypeScript errors

#### Manual Verification:

- Navigating to `/auth/update-password` without a session redirects to `/auth/signin`
- Visiting `/auth/confirm?token_hash=invalid&type=recovery` redirects to `/auth/auth-error`; the auth-error page shows the explanation and both links work
- With a valid session manually established (e.g., after sign-in), navigating to `/auth/update-password` renders the form; submitting mismatched passwords shows the client-side error without a page reload
- Submitting a valid password pair from an authenticated session redirects to `/inventory`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Supabase email template + end-to-end verification

### Overview

Updates the Supabase "Password Reset" email template to send a `token_hash`-based link instead of the default `{{ .ConfirmationURL }}`, then verifies the complete flow end-to-end using a real email.

### Changes Required:

#### 1. Supabase email template update

**File**: Supabase dashboard → Authentication → Email Templates → "Reset Password"

**Intent**: Replace `{{ .ConfirmationURL }}` in the template with a token-hash URL that routes through the app's `/auth/confirm` endpoint. This is the step that connects the Supabase-generated token to the app's token-exchange route.

**Contract**: The reset link in the template must be:
```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password
```

Also verify that the Supabase project's "Site URL" (Authentication → URL Configuration) is set to the app's deployed URL (or `http://localhost:4321` for local development).

### Success Criteria:

#### Automated Verification:

- (none — this phase is configuration only)

#### Manual Verification:

- Supabase dashboard → Authentication → URL Configuration → Site URL is set to `http://localhost:4321` (local dev) or the deployed URL (production) — mismatches cause every reset link to 404
- Full end-to-end flow completes without error:
  1. Sign out (or use a fresh session)
  2. Go to `/auth/signin` → click "Forgot password?"
  3. Enter a real email address for an existing account → land on `/auth/reset-email-sent`
  4. Receive the reset email → click the link → land on `/auth/update-password` (not `/auth/auth-error`)
  5. Enter a new password (≥ 6 chars, confirmed) → land on `/inventory` as a logged-in user
  6. Sign out and sign back in with the new password → succeeds
  7. Attempting to use the same reset link again → lands on `/auth/auth-error` (token is single-use)

**Implementation Note**: Phase 3 is the acceptance gate for the entire S-01 slice. All manual steps must pass before this change can be marked done.

---

## Testing Strategy

### Manual Testing Steps:

1. Happy path: full reset flow from forgot-password to /inventory (Phase 3 success criteria above)
2. Expired/reused link: click a reset link a second time → verify `/auth/auth-error` appears
3. Invalid email on forgot-password form: submit a non-email string → client-side error, no redirect
4. Password mismatch on update-password form: enter non-matching passwords → client-side error, no redirect
5. Direct URL access: navigate to `/auth/update-password` without a session → redirect to `/auth/signin`
6. Supabase misconfigured: temporarily remove env vars and submit forgot-password form → verify the error surfaces on the form page

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-01, FR-013)
- PRD: `context/foundation/prd.md` (FR-013 + Access Control section)
- Lessons: `context/foundation/lessons.md` (null-check createClient; formatDate — not applicable here, no dates)
- Pattern reference: `src/pages/api/auth/signin.ts` (POST route shape), `src/components/auth/SignInForm.tsx` (form component shape), `src/pages/auth/confirm-email.astro` (static success page shape)
- Supabase docs (from session research): password-based auth → PKCE token_hash flow for Astro SSR

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reset request flow

#### Automated

- [x] 1.1 `npm run lint` passes across all new and modified Phase 1 files — 2ccd663
- [x] 1.2 `npx astro check` (or build) completes without TypeScript errors — 2ccd663

#### Manual

- [x] 1.3 "Forgot password?" link visible below password field on `/auth/signin`; navigates to `/auth/forgot-password` — 2ccd663
- [x] 1.4 Invalid email on forgot-password form shows client-side error without redirect — 2ccd663
- [x] 1.5 Valid email submission navigates to `/auth/reset-email-sent` — 2ccd663
- [x] 1.6 Supabase dashboard shows a password recovery event for the submitted email — 2ccd663

### Phase 2: Confirm callback + update-password flow

#### Automated

- [x] 2.1 `npm run lint` passes across all new and modified Phase 2 files
- [x] 2.2 `npx astro check` (or build) completes without TypeScript errors

#### Manual

- [x] 2.3 `/auth/update-password` without a session redirects to `/auth/signin`
- [x] 2.4 `/auth/confirm?token_hash=invalid&type=recovery` redirects to `/auth/auth-error`; both links on auth-error page work
- [x] 2.5 Mismatched passwords on update-password form shows client-side error without redirect
- [x] 2.6 Valid password pair from an authenticated session redirects to `/inventory`

### Phase 3: Supabase email template + end-to-end verification

#### Manual

- [ ] 3.0 Supabase dashboard → Authentication → URL Configuration → Site URL matches the app's URL (`http://localhost:4321` or deployed URL)
- [ ] 3.1 Full end-to-end reset flow completes: forgot-password → email → confirm → update-password → `/inventory`
- [ ] 3.2 Re-using the same reset link shows `/auth/auth-error`
- [ ] 3.3 Sign-in with the new password succeeds after reset
