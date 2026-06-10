---
change_id: testing-bootstrap-unit-conversion
title: Bootstrap test runner and unit-conversion correctness
status: implemented
created: 2026-06-10
updated: 2026-06-10
archived_at: null
---

## Notes

Rollout Phase 1 of context/foundation/test-plan.md: "Bootstrap test runner + unit-conversion correctness".

Risks covered: #1, #6. Test types planned: unit.

Risk response intent:

- Risk #1: Checking off in a unit different from the pantry item's stored unit updates the stored quantity by the correct converted amount; an unsupported unit pair is rejected without corrupting stored data.
- Risk #6: API routes accepting quantity/unit (checkoff, product edit) reject negative, zero, or non-numeric quantities and unrecognized units with a 4xx and no write.

/10x-research

Ground rollout Phase 1 of context/foundation/test-plan.md.

Risks to verify: Risk #1, Risk #6.
Risk response guidance to verify, not blindly accept:

- Risk #1: prove that checking off a shopping-list item in a unit different from the pantry item's stored unit updates the stored quantity by the correct converted amount, and that an unsupported unit pair is rejected without corrupting stored data; challenge "the conversion table is symmetric/complete" -- every UI-offered unit pair must have a factor, and A->B->A must round-trip within acceptable rounding; avoid the oracle problem -- do not derive expected conversion values by reading them out of the implementation itself, use real-world unit definitions instead.
- Risk #6: prove that API routes accepting quantity/unit input (checkoff, product edit) reject negative, zero, or non-numeric quantities and unrecognized units with a 4xx and no write; challenge "the client form already validates this" -- a fetch() call can bypass the form entirely; avoid testing validation only at the React form layer.

Hot-spot directories that raised these risks (likelihood evidence -- NOT anchors): src/pages/shopping-list/ (10 commits/30d, top-churned dir).
Stack: Vitest via getViteConfig() from astro/config for unit + integration (none configured yet -- this phase bootstraps it); Astro Container API for endpoint integration testing.

The test plan carries evidence and response intent, not code anchors. For each risk, ground the real failure path in code, quote relevant lines, verify or correct the response guidance, locate existing tests (if any), identify the cheapest useful test layer, and flag speculative risks or misleading hot-spot evidence.

Write findings to context/changes/testing-bootstrap-unit-conversion/research.md.
Then follow the downstream continuation rule (suggest /10x-plan next unless a blocker or test-plan correction surfaced).
