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
