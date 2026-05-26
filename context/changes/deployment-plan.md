# Cloudflare Workers Deployment Plan

**Project**: smart-pantry-tracker
**Target**: Cloudflare Workers (first production deploy)
**Source**: context/foundation/infrastructure.md
**Created**: 2026-05-26
**Revised**: 2026-05-26 — switched from Pages to Workers; `@astrojs/cloudflare@13` generates Workers output (`dist/server/entry.mjs` + `dist/server/wrangler.json`), not the Pages-style `dist/_worker.js`

---

## Context

The project is an Astro 6 SSR app with a Supabase backend, targeting **Cloudflare Workers** (not Pages — see revision note above). The tech stack and adapter are already committed; `wrangler.jsonc` already contains the critical `disable_nodejs_process_v2` workaround for GitHub #15434. The CI workflow (`ci.yml`) has been updated to use `wrangler deploy --config dist/server/wrangler.json`. The Workers project is auto-created on first deploy; no separate project-create step is needed. However, a **SESSION KV namespace must be created first** — `@astrojs/cloudflare@13` always wires in a `SESSION` KV binding regardless of whether `Astro.session` is used.

**What this plan covers**: a zero-gap path from zero to working production URL, with smoke tests after every mutation, explicit human-gate steps, and rollback instructions.

---

## Phase 0 — Pre-flight Verification

> All checks are local and read-only. Nothing touches Cloudflare or GitHub.

- [x] **0.1** Confirm wrangler.jsonc has both `nodejs_compat` AND `disable_nodejs_process_v2` in `compatibility_flags`
  - Expected: `["nodejs_compat", "disable_nodejs_process_v2"]` — already present; verify file was not modified
  - File: [wrangler.jsonc](../../wrangler.jsonc)

- [x] **0.2** Confirm `astro.config.mjs` has `imageService: "compile"` in the cloudflare adapter options
  - Expected: `adapter: cloudflare({ imageService: "compile" })` — already present
  - File: [astro.config.mjs](../../astro.config.mjs)

- [x] **0.3** Confirm `astro.config.mjs` `env.schema` declares `SUPABASE_URL` and `SUPABASE_KEY`
  - Both must be `context: "server"`, `access: "secret"` — already present

- [x] **0.4** Check for CJS-only transitive dependencies
  - Run: `node -e "require('@supabase/ssr')"` and `node -e "require('@supabase/supabase-js')"`
  - Both packages should export ESM. If either throws, a bundler shim is needed before first deploy.
  - **Edge case**: If a CJS error appears, run `npx cjs-module-lexer ./node_modules/@supabase/ssr/dist/index.js` to identify which file — then add it to `vite.ssr.noExternal` in `astro.config.mjs`.

- [x] **0.5** Run a local build to confirm the project compiles clean
  - Set local `.env` with real Supabase credentials
  - Run: `npm run build`
  - Expect: zero errors, `dist/server/entry.mjs` and `dist/server/wrangler.json` present (Workers output — no `_worker.js`)
  - **Note**: adapter v13 always logs "Enabling sessions with Cloudflare KV" — expected; SESSION KV is created in Phase 2
  - **Edge case**: If build fails with "type declarations stale", run `npx astro sync` first

---

## Phase 1 — Cloudflare Account Authentication

> One-time human action. Requires a browser.

- [ ] **1.1** Authenticate wrangler against the Cloudflare account
  - Run: `npx wrangler login`
  - Opens browser OAuth — complete the login flow
  - Confirm: `npx wrangler whoami` should print the account email and account ID
  - **Record the Account ID** — needed in Phase 4 for the GitHub secret `CLOUDFLARE_ACCOUNT_ID`

---

## Phase 2 — Cloudflare Workers Prerequisites

> Creates the SESSION KV namespace and wires secrets. Workers project is auto-created on first deploy (Phase 3); no separate project-create step.

- [ ] **2.1** Create the SESSION KV namespace
  - Run: `npx wrangler kv namespace create SESSION`
  - Note the `id` value printed (e.g. `abc123...`) — this is the production namespace ID
  - Run: `npx wrangler kv namespace create SESSION --preview`
  - Note the `id` value from this second command — this is the preview namespace ID
  - Open [wrangler.jsonc](../../wrangler.jsonc) and add the `kv_namespaces` block:

    ```jsonc
    "kv_namespaces": [
      { "binding": "SESSION", "id": "<production-id>", "preview_id": "<preview-id>" }
    ]
    ```

  - **Edge case**: If the name `SESSION` collides with an existing namespace, use `SESSION_SPT` as the binding name and update `sessionKVBindingName` in the adapter config in [astro.config.mjs](../../astro.config.mjs): `cloudflare({ imageService: "compile", sessionKVBindingName: "SESSION_SPT" })`

- [ ] **2.2** Set secrets for the Workers deployment — **CLI STEPS**
  - Run: `npx wrangler secret put SUPABASE_URL` — paste the value when prompted
  - Run: `npx wrangler secret put SUPABASE_KEY` — paste the value when prompted
  - Secrets set via `wrangler secret put` are encrypted at rest and injected at runtime; they do NOT go in `wrangler.jsonc`
  - **Critical**: Names must match exactly what is declared in `astro.config.mjs` env.schema (`SUPABASE_URL`, `SUPABASE_KEY`). A mismatch causes silent `null` returns from `createClient()` — build succeeds but all Supabase calls fail silently.
  - **Edge case**: If you later add a new secret (e.g. `OPENROUTER_API_KEY`), always add it to `env.schema` in `astro.config.mjs` FIRST, then run `wrangler secret put` — never the reverse.

- [ ] **2.3** Verify wrangler.jsonc is complete
  - File: [wrangler.jsonc](../../wrangler.jsonc) should now contain `name`, `compatibility_date`, `compatibility_flags`, `observability`, and `kv_namespaces`
  - The generated `dist/server/wrangler.json` inherits from this file at deploy time

---

## Phase 3 — First Manual Deploy + Smoke Tests

> Establishes the live URL before wiring CI. Manual first deploy ensures the project exists before `wrangler-action` runs.

- [ ] **3.1** Build for production
  - Ensure local `.env` has real `SUPABASE_URL` and `SUPABASE_KEY`
  - Run: `npm run build`
  - Verify `dist/server/entry.mjs` and `dist/server/wrangler.json` exist after build completes

- [x] **3.2** Deploy to Cloudflare Workers
  - Run: `npx wrangler deploy --config dist/server/wrangler.json`
  - Deployed: **[smart-pantry-tracker.kinga-kacper-pala.workers.dev](https://smart-pantry-tracker.kinga-kacper-pala.workers.dev)**
  - Version ID: `b797487a-b34a-4643-ab11-1a9d58536edb`
  - **Note**: the Workers project is created automatically on first deploy — no separate project-create step

- [ ] **3.3** Smoke test — unauthenticated routes
  - Open `https://smart-pantry-tracker.kinga-kacper-pala.workers.dev/` — expect home page HTML (not `[object Object]`)
  - Open `https://smart-pantry-tracker.kinga-kacper-pala.workers.dev/auth/signin` — expect the sign-in form

- [ ] **3.4** Smoke test — auth middleware (highest-risk check)
  - Open `https://smart-pantry-tracker.kinga-kacper-pala.workers.dev/dashboard` in an incognito browser
  - **Expected**: redirect to `/auth/signin` (middleware ran, user is null, redirect fires)
  - **Failure signal**: if the page returns `[object Object]` or a blank page, `disable_nodejs_process_v2` is not applying
  - **Edge case 3.4a**: If `[object Object]` appears, run `npx wrangler tail smart-pantry-tracker` to inspect logs. Re-confirm `compatibility_flags` in wrangler.jsonc and redeploy. Last resort: add the flag directly in Cloudflare dashboard → Workers → `smart-pantry-tracker` → Settings → Compatibility Flags.

- [ ] **3.5** Smoke test — sign-up and sign-in flow
  - Use a test email (non-real address to avoid dirty data in prod Supabase)
  - Complete sign-up → confirm email if required → sign in → verify `https://smart-pantry-tracker.kinga-kacper-pala.workers.dev/dashboard` loads with HTML
  - **Edge case**: If sign-in causes a redirect loop, inspect browser DevTools → Network → Response Headers — confirm `Set-Cookie` is present and not being stripped

---

## Phase 4 — GitHub Actions Secrets Wiring

> One-time human setup. Gives CI the ability to deploy.

- [ ] **4.1** Create a scoped Cloudflare API token — **HUMAN STEP**
  - Navigate to: Cloudflare Dashboard → My Profile → API Tokens → Create Token
  - Use template "Edit Cloudflare Workers" OR create custom token with:
    - Permission: `Workers Scripts — Edit`
    - Account scope: your account only
    - **Do NOT use an account-level token** — scope to Workers only (minimal-permissions posture)
  - Copy the token value — shown only once

- [ ] **4.2** Add secrets to the GitHub repository — **HUMAN STEP**
  - Navigate to: GitHub repo → Settings → Secrets and variables → Actions → New repository secret
  - Add:
    - `CLOUDFLARE_API_TOKEN` = (token from 4.1)
    - `CLOUDFLARE_ACCOUNT_ID` = (account ID from step 1.1)
    - `SUPABASE_URL` = (same value used in step 2.2)
    - `SUPABASE_KEY` = (same value used in step 2.2)
  - `SUPABASE_URL` and `SUPABASE_KEY` are needed at **build time** (CI's `npm run build` reads them via `astro:env/server`); runtime values are already set as Workers secrets via step 2.2

- [ ] **4.3** Verify the CI workflow deploy command
  - File: [.github/workflows/ci.yml](../../.github/workflows/ci.yml), deploy step
  - Current command: `deploy --config dist/server/wrangler.json` — already updated; confirm it is present

---

## Phase 5 — CI Pipeline Verification

> Triggers a real CI run and verifies end-to-end.

- [ ] **5.1** Push a trivial commit to `main` to trigger the CI workflow
  - Watch the Actions tab in GitHub for the `CI` workflow run

- [ ] **5.2** Verify all CI steps pass in order
  - `npx astro sync` — no type errors
  - `npm run lint` — no lint errors
  - `npm run build` — completes using `SUPABASE_URL`/`SUPABASE_KEY` secrets
  - `Deploy to Cloudflare Workers` — prints deployment URL and exits 0
  - **Edge case**: If deploy step fails with "workers.dev subdomain not found", run `wrangler subdomain create smart-pantry-tracker` locally to reserve the subdomain first.
  - **Edge case**: If deploy step fails with "authentication error", the API token is wrong or lacks `Workers Scripts — Edit` permission — re-generate (Phase 4.1) and update the secret.
  - **Edge case**: If deploy step fails with "KV namespace not found", the namespace IDs in `wrangler.jsonc` don't exist in the account — re-run Phase 2.1.

- [ ] **5.3** Re-run smoke tests against the CI-deployed URL
  - Repeat steps 3.3 and 3.4 using the URL from the CI deployment output
  - Confirms CI-deployed build behaves identically to the manual deploy

---

## Phase 6 — Post-Deploy Hardening

> Operational health and rollback documentation.

- [ ] **6.1** Verify observability is active
  - Run: `npx wrangler tail smart-pantry-tracker`
  - Trigger a page request; confirm log lines appear in the tail output
  - `observability: { enabled: true }` is already in `wrangler.jsonc`

- [ ] **6.2** Document rollback procedure
  - List deployments: `npx wrangler deployments list --name=smart-pantry-tracker`
  - Rollback: check out target commit → `npm run build` → `npx wrangler deploy --config dist/server/wrangler.json`
  - Alternative (no local rebuild): Cloudflare dashboard → Workers → `smart-pantry-tracker` → Deployments → find target → "Rollback"
  - **Important**: database migrations do NOT roll back automatically — schema changes are forward-only

- [ ] **6.3** Note data isolation — awareness step
  - The Workers deployment (`smart-pantry-tracker.workers.dev`) shares the production Supabase project
  - Test sign-ups land in production Supabase — use non-real emails during testing

- [ ] **6.4** Pin wrangler version
  - Run: `npm ls wrangler` to get the exact installed version
  - Change `^4.90.0` in `package.json` to the exact version (e.g. `4.90.0`)
  - Why: the `disable_nodejs_process_v2` workaround must survive `npm install` on new machines and CI; a semver range could pick up a breaking minor update

---

## Verification Summary

| Check | Route | Expected |
| --- | --- | --- |
| Home page renders | `/` | HTML, no `[object Object]` |
| Auth redirect fires | `/dashboard` (unauthenticated) | Redirect to `/auth/signin` |
| Sign-in page renders | `/auth/signin` | Form HTML |
| Auth flow completes | Sign up → confirm → sign in | `/dashboard` loads with user data |
| CI deploy runs | Push to `main` | All steps green, deployment URL printed |
| Logs stream | `wrangler tail smart-pantry-tracker` | Request log lines visible |

---

## Edge Case Reference

| Scenario | Symptom | Fix |
| --- | --- | --- |
| `nodejs_compat` + middleware bug (#15434) | `/dashboard` returns `[object Object]` | Verify `disable_nodejs_process_v2` in wrangler.jsonc; add via dashboard (Workers → Settings → Compatibility Flags) if CLI flag ignored |
| Missing env var in `env.schema` | Silent `null` from `createClient()` | Add to `env.schema` in `astro.config.mjs` before running `wrangler secret put` |
| CJS-only dependency | Runtime `require is not defined` | Add to `vite.ssr.noExternal` in `astro.config.mjs` |
| KV namespace not found | Deploy fails with binding error | Re-create namespace (Phase 2.1); ensure IDs in `wrangler.jsonc` match the account |
| Workers subdomain not found | Deploy fails to publish URL | Run `wrangler subdomain create smart-pantry-tracker` to reserve the subdomain |
| Token scope too broad | Security posture violation | Re-create token scoped to `Workers Scripts — Edit` only |
| Test sign-up data in prod Supabase | Dirty test user records | Use non-real emails during testing |

---

## Execution Notes

<!-- Fill in after executing this plan -->

- **Production URL**:
- **Deployment date**:
- **Secrets wired**: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SUPABASE_URL, SUPABASE_KEY
- **Deviations from plan**:
