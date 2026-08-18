---
change_id: refactor-opportunities
title: Rank and prioritize refactoring opportunities
status: new
created: 2026-08-18
updated: 2026-08-18
archived_at: null
---

## Notes

We have an analysis documenting technical debt and structural risks in shopping-list (context/changes/shopping-list/research.md). This change answers the questions that analysis intentionally left open:

**Which problems are worth fixing?** In what target shape? In what order?

We'll explore each recorded problem in the code and history, then organize them as refactor opportunities ranked by impact, effort, and risk.

The change proceeds in stages:
1. **Exploration** — research.md: which problems exist, their trade-offs, options for fixing each
2. **Decision and Plan** — plan.md: which refactors we'll do, in what order, and why
3. **Implementation** — code changes per plan

At exploration stage, no refactoring happens and no decision is made. The result is a research.md report ended with ranking of options and their trade-offs.
