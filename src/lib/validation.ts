import { isKnownUnit } from "./units";

interface ProductInput {
  quantity: number;
  unit: string;
  minThreshold: number;
  currentUnit: string;
}

type ValidationResult = { ok: true } | { ok: false; status: number; message: string };

/**
 * Validate the fields `products/[id].ts` PUT writes. `quantity` and
 * `minThreshold` must be > 0 (matching the existing checkoff guard).
 * `unit` must be recognized, or unchanged from `currentUnit` so existing
 * products with a legacy unrecognized unit aren't broken by unrelated edits.
 */
export function validateProductInput(input: ProductInput): ValidationResult {
  if (isNaN(input.quantity) || input.quantity <= 0) {
    return { ok: false, status: 400, message: "quantity must be > 0" };
  }
  if (isNaN(input.minThreshold) || input.minThreshold <= 0) {
    return { ok: false, status: 400, message: "min_threshold must be > 0" };
  }

  const unitChanged = input.unit.toLowerCase().trim() !== input.currentUnit.toLowerCase().trim();
  if (unitChanged && !isKnownUnit(input.unit)) {
    return { ok: false, status: 422, message: `Unrecognized unit: ${input.unit}` };
  }

  return { ok: true };
}
