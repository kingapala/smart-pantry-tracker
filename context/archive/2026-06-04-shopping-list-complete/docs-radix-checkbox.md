---
change_id: shopping-list-complete
type: docs
library: "@radix-ui/react-checkbox"
source: https://www.radix-ui.com/primitives/docs/components/checkbox
fetched: 2026-06-04
---

# `@radix-ui/react-checkbox` — Docs

## Installation

```bash
npm install @radix-ui/react-checkbox
```

> **Project convention:** This project uses individual Radix packages (`@radix-ui/react-slot` is already installed). Use the standalone import, not the `radix-ui` umbrella package:

```tsx
import * as Checkbox from "@radix-ui/react-checkbox"
```

---

## API Reference

### `Checkbox.Root`

Contains all parts of a checkbox. Automatically renders a hidden `<input type="checkbox">` inside a `<form>` so native form submission works without extra wiring.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `asChild` | `boolean` | `false` | Merge props onto child element instead of rendering a `<button>` |
| `defaultChecked` | `boolean \| 'indeterminate'` | — | Uncontrolled initial state |
| `checked` | `boolean \| 'indeterminate'` | — | Controlled state |
| `onCheckedChange` | `(checked: boolean \| 'indeterminate') => void` | — | Fires on every state change |
| `disabled` | `boolean` | — | Prevents interaction |
| `required` | `boolean` | — | For native form validation |
| `name` | `string` | — | Form field name for the hidden input |
| `value` | `string` | `"on"` | Value submitted with the form when checked |

**Data attributes** (for Tailwind `data-*` variants):

| Attribute | Values |
|---|---|
| `data-[state]` | `"checked"` \| `"unchecked"` \| `"indeterminate"` |
| `data-[disabled]` | Present when `disabled` prop is set |

### `Checkbox.Indicator`

Renders **only** when state is `checked` or `indeterminate`. Use it to wrap an icon or checkmark.

| Prop | Type | Notes |
|---|---|---|
| `asChild` | `boolean` | Merge onto child element |
| `forceMount` | `boolean` | Always render — useful for CSS enter/exit animations |

Data attributes mirror `Checkbox.Root`: `data-[state]`, `data-[disabled]`.

---

## Accessibility

- Adheres to the **WAI-ARIA tri-state Checkbox** design pattern
- **Keyboard:** `Space` checks/unchecks
- The hidden `<input>` rendered inside forms ensures events propagate correctly and native form validation works
- Pair with `<label htmlFor={id}>` or `aria-label` for screen reader support

---

## Usage Patterns

### Uncontrolled (plain form POST — simpler, no React state)

```tsx
<Checkbox.Root name="item_id" value={product.id}>
  <Checkbox.Indicator>
    <Check className="h-3.5 w-3.5" aria-hidden />
  </Checkbox.Indicator>
</Checkbox.Root>
```

Good for cases where the check triggers a direct form submit (e.g., manual item delete).

### Controlled (React state — needed to intercept check and open a dialog)

```tsx
const [checked, setChecked] = useState(false)

<Checkbox.Root
  checked={checked}
  onCheckedChange={(state) => {
    if (state === true) openQtyDialog(product.id) // intercept before updating inventory
    setChecked(state as boolean)
  }}
>
  <Checkbox.Indicator>
    <Check className="h-3.5 w-3.5 text-white" aria-hidden />
  </Checkbox.Indicator>
</Checkbox.Root>
```

**S-05 requirement:** FR-012 check-off must ask for qty purchased before updating inventory → controlled mode is required.

### Indeterminate state

```tsx
const [checked, setChecked] = useState<boolean | "indeterminate">("indeterminate")

<Checkbox.Root checked={checked} onCheckedChange={setChecked}>
  <Checkbox.Indicator>
    {checked === "indeterminate" && <Minus className="h-3.5 w-3.5" aria-hidden />}
    {checked === true && <Check className="h-3.5 w-3.5" aria-hidden />}
  </Checkbox.Indicator>
</Checkbox.Root>
```

---

## Tailwind CSS 4 Styling

Tailwind CSS 4 `data-*` variants work directly on Radix data attributes — no plugin needed.

```tsx
<Checkbox.Root
  className={cn(
    // Base
    "flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300 bg-white",
    // Focus ring
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2",
    // Checked state
    "data-[state=checked]:border-green-600 data-[state=checked]:bg-green-600",
    // Disabled state
    "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
  )}
>
  <Checkbox.Indicator>
    <Check className="h-3.5 w-3.5 text-white" aria-hidden />
  </Checkbox.Indicator>
</Checkbox.Root>
```

> **Tailwind JIT rule:** `data-[state=checked]:bg-green-600` must appear as a **full literal string** in source — never build it from string concatenation or it will be purged from the CSS bundle.

---

## Complete S-05 Component Sketch

```tsx
// src/components/ShoppingListItem.tsx
import * as Checkbox from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface Props {
  product: { id: string; name: string; unit: string }
}

export function ShoppingListItem({ product }: Props) {
  const [checked, setChecked] = useState(false)
  const [qtyDialogOpen, setQtyDialogOpen] = useState(false)

  function handleCheckedChange(state: boolean | "indeterminate") {
    if (state === true) {
      setQtyDialogOpen(true) // open qty dialog — submit qty to /api/shopping/checkoff
    } else {
      setChecked(false)
    }
  }

  return (
    <li className="flex items-center gap-3 py-2">
      <Checkbox.Root
        id={`item-${product.id}`}
        checked={checked}
        onCheckedChange={handleCheckedChange}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300 bg-white",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2",
          "data-[state=checked]:border-green-600 data-[state=checked]:bg-green-600",
          "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        )}
      >
        <Checkbox.Indicator>
          <Check className="h-3.5 w-3.5 text-white" aria-hidden />
        </Checkbox.Indicator>
      </Checkbox.Root>

      <label htmlFor={`item-${product.id}`} className="flex-1 text-sm text-gray-800">
        {product.name}
      </label>

      {/* Qty dialog: <input type="number" min="0"> + confirm button */}
      {/* On confirm: POST to /api/shopping/checkoff with product_id + qty_purchased */}
      {/* On success: setChecked(true), setQtyDialogOpen(false) */}
    </li>
  )
}
```

Use with `client:load` in the Astro page so the React state and `onCheckedChange` handler hydrate on the client.

---

## Key Implementation Decisions for S-05

| Decision | Choice | Reason |
|---|---|---|
| Controlled vs uncontrolled | **Controlled** | FR-012 requires intercepting the check to open a qty dialog before the inventory update fires |
| Import path | `@radix-ui/react-checkbox` (standalone) | Consistent with existing `@radix-ui/react-slot` in `package.json` |
| Icon | `lucide-react` Check (already installed) | Zero new deps; already in project |
| Form submission | Astro API route POST after qty confirmation | Matches existing auth route pattern; no Server Actions needed |
