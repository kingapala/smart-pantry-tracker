---
project: smart-pantry-tracker
researched_at: 2026-05-25
recommended_platform: Cloudflare Pages
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR) + React 19
  runtime: Cloudflare Pages (workerd) via @astrojs/cloudflare
  database: Supabase (external)
---

## Recommendation

**Deploy on Cloudflare Pages.**

The `@astrojs/cloudflare` adapter is already the committed adapter in this project's tech stack — switching would require adapter replacement and re-auditing every CLAUDE.md convention written for the Cloudflare runtime. The free tier covers ~3 M SSR requests/month (100 k/day) with unlimited bandwidth, making it genuinely free at MVP scale. Cloudflare has the strongest agent-readable documentation setup of any candidate (scoped `llms.txt` per product, markdown-for-agents on every docs page, a Claude Code-specific setup guide) and a production-ready managed MCP server suite. The middleware/`nodejs_compat` bug — the most material risk for this project — has a documented workaround captured in the risk register below.

## Platform Comparison

| Platform | CLI-first | Managed | Agent docs | Stable API | MCP | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Pages** | Partial | Pass | Pass | Pass | Pass | 9 |
| **Vercel** | Pass | Pass | Pass | Pass | Partial | 9 |
| **Netlify** | Partial | Pass | Pass | Pass | Pass | 9 |
| **Fly.io** | Partial | Pass | Pass | Pass | Pass | 9 |
| **Railway** | Partial | Pass | Pass | Pass | Pass | 9 |
| Render | Partial | Pass | Pass | Partial | Partial | 7 |

**CLI-first notes:** Vercel is the only platform with a clean `vercel rollback <id>` command (Pass). All others require a two-step re-deploy or dashboard action (Partial). Render's CLI is newest and lacks a rollback subcommand entirely.

**Managed/serverless:** All six platforms abstract OS patching and hardware provisioning. Cloudflare Pages, Vercel, and Netlify are fully serverless; Fly.io, Railway, and Render run persistent VMs/processes (more config required but no serverless cold-start tradeoffs).

**Agent-readable docs:** All six publish `llms.txt` or equivalent. Cloudflare is best-in-class: per-product scoped endpoints (`/pages/llms-full.txt`), markdown-for-agents on every page, and a dedicated Claude Code setup guide. Netlify Skills (standalone Markdown files in a public GitHub repo) and Railway's `docs.railway.com/agents` page are strong runners-up.

**Stable deploy API:** All six have deterministic one-command deploys with structured output. Render's newer CLI is functional but has less operational history than wrangler, the Vercel CLI, or the Netlify CLI.

**MCP / integration:** Cloudflare (managed remote MCP servers, GA), Netlify (official MCP, GA June 2025), Fly.io (`fly mcp launch`, GA), and Railway (local + remote MCP, GA) all score Pass. Vercel's MCP is public beta (Aug 2025, still beta Apr 2026) — real signal but softer. Render uses a skills catalog instead of a formal MCP server.

### Shortlisted Platforms

#### 1. Cloudflare Pages (Recommended)

Already the committed adapter. Free tier is exceptional: 100 k SSR requests/day (≈3 M/month), unlimited bandwidth, 500 builds/month. Docs-for-agents setup is best-in-class. Managed remote MCP servers (GA) expose `pages_deployments_list` and other structured tools usable from Claude Code directly. The primary risk — the `nodejs_compat` + middleware `[object Object]` bug (GitHub #15434) — has a documented flag workaround. Pages is being steered toward Workers for new projects but remains fully supported.

#### 2. Netlify

GA Astro 6 support shipped March 2026. Free tier: 300 credits/month covering ≈100 GB bandwidth and ≈3 M serverless invocations. Official MCP server (GA June 2025, 8–9 tools). The main project-specific risk is `astro:env/server` runtime resolution: Astro 6 inlines `import.meta.env` at build time, and the `@astrojs/netlify` adapter must be verified to resolve `astro:env/server` at runtime rather than build time. This is a one-time validation, not a fundamental incompatibility. Rollback is dashboard/API only (no CLI command). 10 s function timeout on free tier (26 s max on paid) could affect slow OpenRouter inference calls.

#### 3. Vercel

The only platform with a clean CLI rollback (`vercel rollback <deployment-id>`). MCP server is public beta. Active Astro 6 SSR bugs: esbuild parse error on script chunks (#16258, April 2026) and oversized server bundles (#15502). Hobby tier explicitly prohibits commercial use — production use requires Pro at $20/month. Cold starts of 200–500 ms reported; community-reported TTFB spikes of 3–7 s on SSR routes.

## Anti-Bias Cross-Check: Cloudflare Pages

### Devil's Advocate — Weaknesses

1. **The middleware bug is load-bearing for this project.** GitHub #15434 documents `[object Object]` responses on SSR pages when `nodejs_compat` is enabled and `compatibility_date >= 2025-09-15`. This project routes every request through `src/middleware.ts` for auth. The workaround (`disable_nodejs_process_v2` compatibility flag) is not in the official adapter README — it lives in community forums and may regress on future compatibility date bumps.

2. **Pages is being steered toward deprecation.** Cloudflare now directs new projects to Workers. Pages remains "fully supported" but future first-party Astro improvements and runtime bug fixes will land on Workers first. The project will eventually face a migration decision.

3. **Rollback is not a single command on Pages.** `wrangler rollback <VERSION_ID>` targets Workers, not Pages. Pages rollback requires `wrangler pages deployments list` followed by `wrangler pages deploy` from a specific commit hash — a two-step sequence that is slow to find under incident conditions.

4. **CommonJS dependencies will fail at runtime, not build time.** The `workerd` runtime rejects `require()` / `module.exports`. If any transitive dependency in Supabase's or OpenRouter's client packages is CJS-only, it throws at runtime with an error that resembles an application bug, not a platform incompatibility.

5. **Build minutes are capped at 500/month free.** During an active 3-week MVP sprint with frequent commits across feature branches, 500 builds/month can be exhausted before the sprint ends. Mitigation: configure Pages to build only `main` and explicitly selected preview branches.

### Pre-mortem — How This Could Fail

The deploy goes live in week 1. CI passes. Then auth stops working in production: every authenticated page returns `[object Object]` instead of HTML. The error doesn't appear in `wrangler tail` — it shows up only in the response body. After two days of debugging, a community forum post surfaces the `nodejs_compat` + middleware interaction. The `disable_nodejs_process_v2` flag is added to `wrangler.jsonc` with no comment explaining why. It works.

Three weeks later, a routine wrangler update changes how compatibility flags are read. The flag silently stops applying. Auth breaks again in the same way. The team has forgotten about the first fix.

Meanwhile, a separate problem: OpenRouter calls start returning 401 in production but work in `npm run dev`. The root cause is that a new environment variable (`OPENROUTER_API_KEY`) was added to the Cloudflare Pages dashboard but not to `env.schema` in `astro.config.mjs`. The build succeeds; the runtime call returns `null` from `createClient()`; every OpenRouter request fails. The error is attributed to OpenRouter for three days before the config contract is found.

The assumption that proved wrong: "we already have the Cloudflare adapter — deployment is straightforward." The adapter selection happened at bootstrapping time; the `nodejs_compat` + middleware interaction, the Vite plugin env contract, and the Pages-vs-Workers operational split were not part of that decision.

### Unknown Unknowns

- **Supabase JS client may open a WebSocket on init by default.** `@supabase/supabase-js` initializes a Realtime subscription on instantiation unless explicitly disabled. Cloudflare Pages requires explicit WebSocket upgrade handling for external origins; the client may hang silently. Fix: pass `realtime: { params: { disabled: true } }` to the Supabase client constructor (Realtime is a confirmed MVP non-goal per the PRD).

- **`<Image>` from Astro requires a Cloudflare Images binding in Astro 6.** The default `imageService` changed to `'cloudflare-binding'` in Astro 6. Without a configured binding, any `<Image>` usage fails at runtime, not build time. Override to `imageService: 'compile'` in `astro.config.mjs` unless Cloudflare Images is explicitly configured.

- **`npm run dev` does not run the `workerd` runtime.** The local dev server is Astro's own Node.js server. CommonJS rejection, `nodejs_compat` flag behavior, and cache headers all behave differently from production. Platform-specific bugs will only surface on first deploy, not in local development.

- **GitHub Actions must install wrangler explicitly and scope the API token to Pages only.** Wrangler is not pre-installed in GitHub Actions runners. The `CLOUDFLARE_API_TOKEN` must be created with Pages-scoped permissions — not the account-level token. Missing the scope means the token can be reused across projects, violating minimal-permissions posture.

- **Preview deploy URLs are public by default.** Pull request preview deployments on Cloudflare Pages are publicly accessible without authentication. For this app (data isolation enforced by Supabase RLS, not by the preview URL being secret), this is safe — but if a tester signs up with a real email on a preview build, that user record persists in the production Supabase project unless preview builds use a separate Supabase project or branch.

## Operational Story

- **Preview deploys**: Every branch push creates a public preview URL at `<branch>.<project>.pages.dev`. Preview URLs share the same Cloudflare Pages project and — unless overridden — the same environment variable bindings as production. Protect with Cloudflare Access (zero-trust gate, free tier available) if previews should not be public. Fork PRs from external contributors do not automatically get preview deploys (Pages only builds branches on the same repo by default).

- **Secrets**: Environment variables live in the Cloudflare Pages dashboard under Settings → Environment Variables. Each variable can be set for Production, Preview, or both. The `astro:env/server` schema in `astro.config.mjs` must declare every server secret — adding a secret to the dashboard without adding it to `env.schema` causes a silent runtime null. Rotation: update the dashboard value, trigger a new deploy (no rollback needed for secret-only changes).

- **Rollback**: `wrangler pages deployments list --project-name=<project>` to find the target deployment ID, then `wrangler pages deploy ./dist --project-name=<project> --branch=main` after checking out the target commit locally. Alternatively, use the Pages dashboard → Deployments → "Retry deploy" on any prior deployment. Typical time-to-rollback: 2–5 minutes for a redeploy. DB migrations do not roll back automatically — treat schema changes as forward-only.

- **Approval**: Deployments to Production trigger automatically on merge to `main` (GitHub Actions `auto-deploy-on-merge` flow). No human approval gate is in place by default — add a Cloudflare Pages deployment protection rule if a manual gate is desired before production goes live. Destructive actions (delete project, rotate primary API token, modify DNS) are human-only via the Cloudflare dashboard.

- **Logs**: Runtime logs: `wrangler pages deployment tail --project-name=<project>` (streams live). Build logs: `wrangler pages deployments list` then `wrangler pages deployment tail <deployment-id>`. Function-level filtering: `wrangler tail --status error --format json` (Workers syntax — Pages Functions use `wrangler pages deployment tail` instead). MCP alternative: Cloudflare MCP server exposes `pages_deployments_list` and observability tools as structured tools usable from Claude Code.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `nodejs_compat` + middleware → `[object Object]` responses | Devil's advocate | High (confirmed bug, auth middleware always active) | High (auth breaks site-wide) | Add `disable_nodejs_process_v2` to `wrangler.jsonc` compatibility flags; document with a comment linking to GitHub #15434; add a post-deploy smoke test for authenticated routes in CI |
| Pages steered to Workers; future feature gap | Devil's advocate | Medium | Low (Pages fully supported for MVP horizon) | Accept for MVP; revisit migration to Workers at v2 |
| Pages rollback requires two-step CLI sequence | Devil's advocate | Medium (any bad deploy) | Medium (slower recovery) | Document the rollback sequence in the runbook; add `wrangler pages deployments list` as a pinned CI output |
| CJS-only transitive dependency fails at runtime | Devil's advocate | Low (major clients are ESM; verify at deploy time) | Medium (feature failure, not auth) | Run `npx cjs-module-lexer` or check `package.json` `"exports"` for Supabase and OpenRouter packages before first deploy |
| Build minute budget exhausted during sprint | Devil's advocate | Medium (active 3-week sprint) | Low (blocks new builds; fixes ship via rollback) | Configure Pages branch deploy settings to build only `main` and explicit preview branches; monitor via `wrangler pages deployments list` |
| astro:env/server + new env var not in env.schema → runtime null | Pre-mortem | Medium (easy to miss on new variable addition) | High (silent feature failure) | Enforce: every new Cloudflare dashboard secret must have a corresponding `env.schema` entry; catch via type error in build if field is required |
| `disable_nodejs_process_v2` workaround regresses on wrangler update | Pre-mortem | Low (workaround is a Cloudflare platform flag, not a wrangler version flag) | High (auth breaks site-wide) | Pin wrangler version in `package.json`; add wrangler update to a manual review step in the release process |
| Supabase Realtime WebSocket hangs on init | Unknown unknowns | Low (Realtime is MVP non-goal per PRD) | Low | Pass `realtime: { params: { disabled: true } }` to Supabase client constructor |
| Astro 6 `imageService: 'cloudflare-binding'` fails without binding | Unknown unknowns | Medium (if `<Image>` is used) | Medium (image rendering broken at runtime) | Override `imageService` to `'compile'` in `astro.config.mjs` |
| GitHub Actions wrangler install or token scope error | Unknown unknowns | Medium (one-time setup gap) | Medium (CI deploy silently fails) | Use `cloudflare/wrangler-action` GitHub Action; create a scoped Pages-only API token |
| Preview deploys public; test user data in production Supabase | Unknown unknowns | Low (RLS enforces isolation) | Low (no data leak, but dirty test data) | Use a separate Supabase branch/project for preview builds, or document that preview sign-ups should use non-real emails |

## Getting Started

Cloudflare Pages adapter is already configured in this project. The first deploy sequence:

1. **Authenticate wrangler**: `npx wrangler login` — opens browser OAuth to your Cloudflare account. Confirm with `npx wrangler whoami`.

2. **Add the `nodejs_compat` workaround to `wrangler.jsonc` before first deploy** (prevents the auth middleware breakage):
   ```jsonc
   {
     "compatibility_flags": ["nodejs_compat", "disable_nodejs_process_v2"],
     "compatibility_date": "2025-09-15"
   }
   ```
   If `wrangler.jsonc` does not yet exist, create it at the project root with these fields.

3. **Set environment variables in the Cloudflare Pages dashboard**: Dashboard → Pages → `smart-pantry-tracker` → Settings → Environment Variables. Add `SUPABASE_URL` and `SUPABASE_KEY` for both Production and Preview environments. Confirm each variable has a corresponding entry in `env.schema` in `astro.config.mjs`.

4. **Build and deploy manually for the first time**: `npx wrangler pages deploy ./dist --project-name=smart-pantry-tracker`. Run `npm run build` first to generate `./dist`. Verify the deploy URL resolves and an authenticated route (e.g., `/dashboard`) returns HTML, not `[object Object]`.

5. **Wire GitHub Actions for auto-deploy-on-merge**: Add `CLOUDFLARE_API_TOKEN` (scoped to Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID` to GitHub repository secrets. Use the official `cloudflare/wrangler-action` in the workflow — it handles wrangler installation and token injection automatically.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions workflow authoring)
- Production-scale architecture (multi-region, HA, DR)
