import { describe, expect, it } from "vitest";
import { convertUnit } from "./units";

describe("convertUnit", () => {
  describe("metric conversions (real-world facts, exact)", () => {
    it("converts kg to g (1 kg = 1000 g)", () => {
      expect(convertUnit(2, "kg", "g")).toBe(2000);
    });

    it("converts l to ml (1 l = 1000 ml)", () => {
      expect(convertUnit(1, "l", "ml")).toBe(1000);
    });

    it("converts mg to g (1000 mg = 1 g)", () => {
      expect(convertUnit(500, "mg", "g")).toBe(0.5);
    });

    it("converts dl to ml (1 dl = 100 ml)", () => {
      expect(convertUnit(1, "dl", "ml")).toBe(100);
    });

    it("converts l to dl (1 l = 10 dl)", () => {
      expect(convertUnit(2.5, "l", "dl")).toBe(25);
    });
  });

  describe("round-trip consistency (A -> B -> A)", () => {
    // Round-trips test internal self-inverse consistency, independent of the
    // specific factor values, so a tight tolerance is appropriate here.
    it("round-trips a mass pair (lb <-> kg) within rounding tolerance", () => {
      const original = 2;
      const converted = convertUnit(original, "lb", "kg");
      if (converted === null) throw new Error("expected a non-null conversion");
      const roundTripped = convertUnit(converted, "kg", "lb");
      expect(roundTripped).toBeCloseTo(original, 4);
    });

    it("round-trips a volume pair (cup <-> ml) within rounding tolerance", () => {
      const original = 1.5;
      const converted = convertUnit(original, "cup", "ml");
      if (converted === null) throw new Error("expected a non-null conversion");
      const roundTripped = convertUnit(converted, "ml", "cup");
      expect(roundTripped).toBeCloseTo(original, 4);
    });
  });

  describe("imperial conversions against real-world constants (loose tolerance)", () => {
    // UNIT_MAP's imperial factors (e.g. lb: 453.592) are rounded approximations
    // of the precise real-world constants. A tight tolerance here would
    // spuriously fail against the intentional rounding, so use a looser bound.
    it("converts lb to g close to the precise 453.59237 g/lb constant", () => {
      expect(convertUnit(1, "lb", "g")).toBeCloseTo(453.59237, 3);
    });

    it("converts oz to g close to the precise 28.349523 g/oz constant", () => {
      expect(convertUnit(1, "oz", "g")).toBeCloseTo(28.349523, 3);
    });
  });

  describe("incompatible / unknown units", () => {
    it("returns null for incompatible categories (mass vs volume)", () => {
      expect(convertUnit(1, "kg", "ml")).toBeNull();
    });

    it("returns null when the target unit is unknown", () => {
      expect(convertUnit(1, "kg", "banana")).toBeNull();
    });

    it("returns null when the source unit is unknown", () => {
      expect(convertUnit(1, "banana", "kg")).toBeNull();
    });

    it("returns null when both units are unknown and different", () => {
      expect(convertUnit(1, "foo", "bar")).toBeNull();
    });
  });

  describe("count category", () => {
    it("passes the value through unchanged for count-category pairs", () => {
      expect(convertUnit(5, "pcs", "szt")).toBe(5);
      expect(convertUnit(3, "item", "sztuka")).toBe(3);
    });
  });

  describe("same-unit short-circuit", () => {
    it("returns the input value unchanged for identical units, even unknown ones", () => {
      expect(convertUnit(5, "bunch", "bunch")).toBe(5);
    });
  });

  describe("normalization", () => {
    it("is case-insensitive", () => {
      expect(convertUnit(1, "KG", "g")).toBe(1000);
    });

    it("does not collapse internal whitespace ('Fl  Oz' with a double space is unrecognized)", () => {
      expect(convertUnit(1, "Fl  Oz", "ml")).toBeNull();
    });
  });
});
