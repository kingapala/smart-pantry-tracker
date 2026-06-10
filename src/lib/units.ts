type Category = "mass" | "volume" | "count";

interface UnitInfo {
  category: Category;
  factor: number; // relative to base: g for mass, ml for volume, 1 for count
}

const UNIT_MAP: Partial<Record<string, UnitInfo>> = {
  // Mass (base: g)
  mg: { category: "mass", factor: 0.001 },
  milligram: { category: "mass", factor: 0.001 },
  milligrams: { category: "mass", factor: 0.001 },
  g: { category: "mass", factor: 1 },
  gram: { category: "mass", factor: 1 },
  grams: { category: "mass", factor: 1 },
  dag: { category: "mass", factor: 10 },
  dekagram: { category: "mass", factor: 10 },
  dekagrams: { category: "mass", factor: 10 },
  kg: { category: "mass", factor: 1000 },
  kilogram: { category: "mass", factor: 1000 },
  kilograms: { category: "mass", factor: 1000 },
  oz: { category: "mass", factor: 28.3495 },
  ounce: { category: "mass", factor: 28.3495 },
  ounces: { category: "mass", factor: 28.3495 },
  lb: { category: "mass", factor: 453.592 },
  lbs: { category: "mass", factor: 453.592 },
  pound: { category: "mass", factor: 453.592 },
  pounds: { category: "mass", factor: 453.592 },
  // Volume (base: ml)
  ml: { category: "volume", factor: 1 },
  milliliter: { category: "volume", factor: 1 },
  millilitre: { category: "volume", factor: 1 },
  milliliters: { category: "volume", factor: 1 },
  millilitres: { category: "volume", factor: 1 },
  cl: { category: "volume", factor: 10 },
  centiliter: { category: "volume", factor: 10 },
  centilitre: { category: "volume", factor: 10 },
  dl: { category: "volume", factor: 100 },
  deciliter: { category: "volume", factor: 100 },
  decilitre: { category: "volume", factor: 100 },
  l: { category: "volume", factor: 1000 },
  liter: { category: "volume", factor: 1000 },
  litre: { category: "volume", factor: 1000 },
  liters: { category: "volume", factor: 1000 },
  litres: { category: "volume", factor: 1000 },
  "fl oz": { category: "volume", factor: 29.5735 },
  "fluid oz": { category: "volume", factor: 29.5735 },
  "fluid ounce": { category: "volume", factor: 29.5735 },
  "fluid ounces": { category: "volume", factor: 29.5735 },
  cup: { category: "volume", factor: 236.588 },
  cups: { category: "volume", factor: 236.588 },
  pt: { category: "volume", factor: 473.176 },
  pint: { category: "volume", factor: 473.176 },
  pints: { category: "volume", factor: 473.176 },
  qt: { category: "volume", factor: 946.353 },
  quart: { category: "volume", factor: 946.353 },
  quarts: { category: "volume", factor: 946.353 },
  gal: { category: "volume", factor: 3785.41 },
  gallon: { category: "volume", factor: 3785.41 },
  gallons: { category: "volume", factor: 3785.41 },
  // Count (factor 1 — no numeric conversion, just category compatibility)
  pcs: { category: "count", factor: 1 },
  pc: { category: "count", factor: 1 },
  piece: { category: "count", factor: 1 },
  pieces: { category: "count", factor: 1 },
  szt: { category: "count", factor: 1 },
  sztuka: { category: "count", factor: 1 },
  sztuki: { category: "count", factor: 1 },
  item: { category: "count", factor: 1 },
  items: { category: "count", factor: 1 },
};

/**
 * Convert a quantity from one unit to another.
 * Returns null when units are incompatible (different categories or both unknown).
 * For count units the value passes through unchanged.
 */
export function convertUnit(value: number, fromUnit: string, toUnit: string): number | null {
  const from = fromUnit.toLowerCase().trim();
  const to = toUnit.toLowerCase().trim();

  if (from === to) return value;

  const fromInfo = UNIT_MAP[from];
  const toInfo = UNIT_MAP[to];

  if (!fromInfo || !toInfo) return null;
  if (fromInfo.category !== toInfo.category) return null;
  if (fromInfo.category === "count") return value;

  return (value * fromInfo.factor) / toInfo.factor;
}

/** Whether `unit` is recognized by the conversion table. */
export function isKnownUnit(unit: string): boolean {
  return unit.toLowerCase().trim() in UNIT_MAP;
}

/** Whether two units belong to the same convertible category. */
export function unitsCompatible(unitA: string, unitB: string): boolean {
  const a = unitA.toLowerCase().trim();
  const b = unitB.toLowerCase().trim();
  if (a === b) return true;
  const infoA = UNIT_MAP[a];
  const infoB = UNIT_MAP[b];
  if (!infoA || !infoB) return false;
  return infoA.category === infoB.category;
}
