---
starter_id: 10x-astro-starter
package_manager: npm
project_name: smart-pantry-tracker
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

Smart Pantry Tracker is a solo, after-hours web app with a 3-week MVP timeline, small user base, and a single hard requirement: per-user data isolation enforced at the database level. The 10x Astro Starter (Astro 6 + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Cloudflare Pages) satisfies every constraint without assembly cost. Supabase ships email-and-password auth plus password reset (FR-001–FR-013) and Row-Level Security for data isolation out of the box — the PRD's hardest guardrail is covered before writing a line of product code. TypeScript is project-wide, Zod handles boundary validation, and Tailwind keeps responsive layout fast to build. Cloudflare Pages deploys on every GitHub Actions merge with a generous free tier and zero cold starts, matching the low-QPS, small-data-volume target scale. All four agent-friendly quality gates pass (typed, convention-based, popular in training data, well-documented), making this the lowest-friction path to a shippable, maintainable MVP.
