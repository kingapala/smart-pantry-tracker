---
change_id: checkoff-unit-conversion-integration
title: Integration tests for cross-unit checkoff conversion (Risk #1)
status: implementing
created: 2026-06-12
updated: 2026-06-15
archived_at: null
---

## Notes

Integration-layer coverage for Risk #1 from context/foundation/test-plan.md ("Checking off a shopping-list item in a different unit than the pantry item applies the wrong conversion factor, corrupting the stored quantity").

This is the deferred half of the testing-bootstrap-unit-conversion plan (Phase 1 proved convertUnit() correctness at the unit level; this change adds the integration cases the test-plan.md Risk Response Guidance calls for: "integration (one same-unit and one cross-unit checkoff case)").

Scope: using the Astro Container API against src/pages/api/shopping-list-items/[id]/checkoff.ts and src/pages/api/products/[id]/checkoff.ts, prove:
1. A same-unit checkoff updates the stored quantity by the exact amount.
2. A cross-unit checkoff (e.g. shopping-list item in "kg", pantry product in "g") updates the stored quantity by the correctly converted amount.
3. An unsupported/incompatible unit pair is rejected (422) with no DB write.

Test types: integration only — this was explicitly redirected here from /10x-e2e because the risk is server-side API/DB logic, not browser-level (per test-plan.md's own Risk Response Guidance for Risk #1).
