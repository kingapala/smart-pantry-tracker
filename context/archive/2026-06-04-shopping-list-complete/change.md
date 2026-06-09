---
change_id: shopping-list-complete
title: Shopping list check-off with qty purchased and manual one-off items
status: archived
created: 2026-06-04
updated: 2026-06-09
reviewed: 2026-06-09
archived_at: 2026-06-09T11:05:36Z
---

## Notes

### Post-plan additions (user-requested after plan was closed)

The original plan covered only Phase 1 (pantry check-off endpoint + UI) and Phase 2 (manual item check-off relabel). The following features were added via direct user requests during implementation and are not reflected in plan.md:

| Feature                                                             | Commits                   | Files                                                                                                  |
| ------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Unit conversion (metric + imperial)                                 | a573a70                   | src/lib/units.ts                                                                                       |
| Manual item checkoff → adds to My Pantry                            | a573a70                   | src/pages/api/shopping-list-items/[id]/checkoff.ts                                                     |
| Delete buttons (unlist pantry / delete manual)                      | a573a70                   | src/pages/api/products/[id]/unlist.ts                                                                  |
| Split qty+unit in checkoff dialog + live conversion preview         | a573a70, 3ed34aa, 734b2b7 | src/pages/shopping-list/index.astro                                                                    |
| Expiry date, add-to-list checkbox, min-threshold in checkoff dialog | a573a70                   | src/pages/api/products/[id]/checkoff.ts, index.astro                                                   |
| Edit dialog on all shopping list items                              | c468e70                   | src/pages/api/products/[id]/listing.ts, src/pages/api/shopping-list-items/[id].ts (PATCH), index.astro |
| Remove expiry date from "Add to shopping list" form                 | a573a70                   | src/pages/shopping-list/new.astro                                                                      |
