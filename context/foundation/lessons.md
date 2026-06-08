# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Always null-check createClient() before use

- **Context**: implement phase — src/pages/api/ routes that query Supabase
- **Problem**: Type error at build (and runtime crash) when code calls methods on a null client — createClient() returns null when SUPABASE_URL / SUPABASE_KEY env vars are not set.
- **Rule**: Always null-check createClient() before use. If the client is null, return an error redirect rather than calling any Supabase method.
- **Applies to**: all

## Always use formatDate() / nowUTC() / formatDateDisplay() from @/lib/date.ts

- **Context**: Cały projekt, każde miejsce używające dat — `src/**/*.ts`, `src/**/*.tsx`, `src/**/*.astro`
- **Problem**: Część kodu używa `toISOString()`, część `toLocaleDateString()` — brak spójności; daty mogą być zapisane w lokalnej strefie zamiast UTC, powodując niespójne timestampy w Supabase.
- **Rule**: Always use `formatDate()` / `nowUTC()` / `formatDateDisplay()` from `@/lib/date.ts`. Never call `new Date().toISOString()`, `toLocaleDateString()`, or any Date method that implies a local timezone.
- **Applies to**: all

## Run `npx prettier --write <file>` before trusting a Windows `npm run lint` pass on changed files

- **Context**: implement phase — verifying lint success criteria on Windows checkouts of this repo
- **Problem**: The repo's working tree on Windows has CRLF line endings while Prettier expects LF, so `npm run lint` floods output with hundreds of `Delete ␍` `prettier/prettier` errors on every file. Real formatting issues introduced in changed lines (line-wrapping, attribute ordering, Tailwind class sorting via `prettier-plugin-tailwindcss`) get buried in that noise and look like "pre-existing CRLF noise" — but CI runs on Linux where CRLF isn't an issue, so those real issues surface there as fresh failures after the PR is already "lint-clean" locally.
- **Rule**: After editing a `.astro`/`.ts`/`.tsx` file on Windows, run `npx prettier --write <file>` (or `npm run format`) on it before/alongside `npm run lint`, and re-run lint to confirm only CRLF (`␍`) errors remain — never wave away non-CRLF `prettier/prettier` findings as "pre-existing noise" without checking whether they're on lines you touched.
- **Applies to**: all phases that touch `.astro`/`.ts`/`.tsx` files when working from a Windows checkout
