import { describe, expect, it } from "vitest";
import { expandNumberRangeList, formatNumberRangeList, parseNumberRangeList } from "../src/index.js";

describe("number-range-list-kit", () => {
  it("parses and expands ascending, descending, and unicode ranges", () => {
    const result = parseNumberRangeList("1, 3-5, 10..8, 20‥22");

    expect(result.ok).toBe(true);
    expect(result.values).toEqual([1, 3, 4, 5, 10, 9, 8, 20, 21, 22]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["descending_range"]);
  });

  it("returns structured errors for invalid parts", () => {
    const result = parseNumberRangeList("1,,nope");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toEqual(["empty_part", "invalid_part"]);
    }
  });

  it("can disable descending ranges", () => {
    const result = parseNumberRangeList("5-3", { allowDescending: false });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe("descending_range_disabled");
    }
  });

  it("guards against expansion explosions", () => {
    const result = parseNumberRangeList("1-100", { maxExpandedValues: 10 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe("max_expanded_values_exceeded");
    }
  });

  it("keeps source spans on trimmed range parts", () => {
    const result = parseNumberRangeList("  2 - 4  ", { expand: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input).toBe("  2 - 4  ");
      expect(result.errors).toEqual([]);
      expect(result.segments[0]).toMatchObject({
        start: 2,
        end: 4,
        startIndex: 2,
        endIndex: 7,
        text: "2 - 4"
      });
    }
  });

  it("returns a diagnostic for non-string input", () => {
    const result = parseNumberRangeList(null);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe("not_a_string");
    }
    expect(expandNumberRangeList(null)).toBeNull();
  });

  it("rejects invalid max expansion options instead of silently disabling the guard", () => {
    const result = parseNumberRangeList("1-3", { maxExpandedValues: Number.NaN });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe("invalid_max_expanded_values");
    }
  });

  it("supports duplicate warnings and dedupe", () => {
    const result = parseNumberRangeList("1-3,2", { dedupe: true });

    expect(result.ok).toBe(true);
    expect(result.values).toEqual([1, 2, 3]);
    expect(result.warnings[0]?.code).toBe("duplicate_value");
  });

  it("formats parsed segments and offers a nullable helper", () => {
    const result = parseNumberRangeList("-2--1,4", { expand: false });

    expect(result.ok).toBe(true);
    expect(result.values).toBeNull();
    expect(formatNumberRangeList(result.segments)).toBe("-2--1,4");
    expect(expandNumberRangeList("7...9")).toEqual([7, 8, 9]);
    expect(expandNumberRangeList("bad")).toBeNull();
  });
});
