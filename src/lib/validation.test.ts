import { describe, expect, it } from "vitest";
import { validateProductInput } from "./validation";

describe("validateProductInput", () => {
  it("accepts a positive quantity, positive min_threshold, and a recognized unit", () => {
    expect(validateProductInput({ quantity: 1, unit: "kg", minThreshold: 1, currentUnit: "kg" })).toEqual({ ok: true });
  });

  describe("quantity must be > 0", () => {
    it("rejects quantity = 0 with 400", () => {
      expect(validateProductInput({ quantity: 0, unit: "kg", minThreshold: 1, currentUnit: "kg" })).toEqual({
        ok: false,
        status: 400,
        message: "quantity must be > 0",
      });
    });

    it("rejects a negative quantity with 400", () => {
      expect(validateProductInput({ quantity: -1, unit: "kg", minThreshold: 1, currentUnit: "kg" })).toEqual({
        ok: false,
        status: 400,
        message: "quantity must be > 0",
      });
    });

    it("rejects a NaN quantity (parseFloat('abc')) with 400", () => {
      expect(
        validateProductInput({
          quantity: NaN,
          unit: "kg",
          minThreshold: 1,
          currentUnit: "kg",
        }),
      ).toEqual({ ok: false, status: 400, message: "quantity must be > 0" });
    });
  });

  describe("min_threshold must be > 0", () => {
    it("rejects min_threshold = 0 with 400", () => {
      expect(validateProductInput({ quantity: 1, unit: "kg", minThreshold: 0, currentUnit: "kg" })).toEqual({
        ok: false,
        status: 400,
        message: "min_threshold must be > 0",
      });
    });

    it("rejects a negative min_threshold with 400", () => {
      expect(validateProductInput({ quantity: 1, unit: "kg", minThreshold: -1, currentUnit: "kg" })).toEqual({
        ok: false,
        status: 400,
        message: "min_threshold must be > 0",
      });
    });

    it("rejects a NaN min_threshold (parseFloat('abc')) with 400", () => {
      expect(
        validateProductInput({
          quantity: 1,
          unit: "kg",
          minThreshold: NaN,
          currentUnit: "kg",
        }),
      ).toEqual({ ok: false, status: 400, message: "min_threshold must be > 0" });
    });
  });

  describe("unit recognition", () => {
    it("rejects an unrecognized unit that differs from the current unit with 422", () => {
      expect(
        validateProductInput({
          quantity: 1,
          unit: "banana",
          minThreshold: 1,
          currentUnit: "kg",
        }),
      ).toEqual({ ok: false, status: 422, message: "Unrecognized unit: banana" });
    });

    it("accepts an unrecognized unit that equals the current unit (legacy-data exemption)", () => {
      expect(
        validateProductInput({
          quantity: 1,
          unit: "banana",
          minThreshold: 1,
          currentUnit: "banana",
        }),
      ).toEqual({ ok: true });
    });

    it("accepts a recognized unit that differs from the current unit (a real unit change)", () => {
      expect(validateProductInput({ quantity: 1, unit: "kg", minThreshold: 1, currentUnit: "g" })).toEqual({
        ok: true,
      });
    });
  });
});
