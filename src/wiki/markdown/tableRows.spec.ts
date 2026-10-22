import { describe, expect, it } from "vitest";
import { compareCells, formatStat, isNumeric, matches, numberOf, parseFilter, stat, statsOf } from "./tableRows.ts";

describe("numberOf", () => {
  it("reads numbers the way people write them", () => {
    expect(numberOf("1,200")).toBe(1200);
    expect(numberOf("12.5")).toBe(12.5);
    expect(numberOf("-3")).toBe(-3);
    expect(numberOf("40%")).toBe(40);
    expect(numberOf("$9.99")).toBe(9.99);
    expect(numberOf("2.5k")).toBe(2500);
    expect(numberOf("1.2M")).toBe(1_200_000);
    expect(numberOf("3,5")).toBe(3.5);
    expect(numberOf(" 7 ")).toBe(7);
  });

  it("isn't fooled by words, dates or versions", () => {
    for (const s of ["", "Rat", "2026-10-22", "1.2.3", "v2", "12 hp", "k"]) expect(numberOf(s)).toBeNull();
  });
});

describe("sorting", () => {
  it("orders numbers by value and text with 2 before 10, empty cells last either way", () => {
    const sort = (values: string[], numeric: boolean, dir: 1 | -1) =>
      [...values].sort((a, b) => compareCells(a, b, numeric, dir));
    expect(sort(["10", "", "2", "1,000"], true, 1)).toEqual(["2", "10", "1,000", ""]);
    expect(sort(["10", "", "2", "1,000"], true, -1)).toEqual(["1,000", "10", "2", ""]);
    expect(sort(["Wolf", "rat", "Level 10", "Level 2"], false, 1)).toEqual(["Level 2", "Level 10", "rat", "Wolf"]);
  });

  it("calls a column numeric when most of its cells are numbers", () => {
    expect(isNumeric(["1", "2", "", "3", "4", "n/a"])).toBe(true);
    expect(isNumeric(["1", "two", "three"])).toBe(false);
    expect(isNumeric(["", ""])).toBe(false);
  });
});

describe("filters", () => {
  const columns = ["Name", "HP", "Biome"];
  const rows = [
    ["Rat", "20", "Sewer"],
    ["Wolf", "30", "Dark forest"],
    ["Slime", "45", "Forest"],
  ];
  const keep = (filter: string) => rows.filter((r) => matches(r, parseFilter(filter, columns))).map((r) => r[0]);

  it("finds words anywhere in a row, all of them", () => {
    expect(keep("forest")).toEqual(["Wolf", "Slime"]);
    expect(keep("forest wolf")).toEqual(["Wolf"]);
    expect(keep("")).toEqual(["Rat", "Wolf", "Slime"]);
  });

  it("compares a column's numbers, and matches its text", () => {
    expect(keep("hp>20")).toEqual(["Wolf", "Slime"]);
    expect(keep("HP<=30")).toEqual(["Rat", "Wolf"]);
    expect(keep("hp=45")).toEqual(["Slime"]);
    expect(keep("biome:forest")).toEqual(["Wolf", "Slime"]);
    expect(keep("biome=forest")).toEqual(["Slime"]);
    expect(keep('biome:"dark forest"')).toEqual(["Wolf"]);
    expect(keep("name!=rat")).toEqual(["Wolf", "Slime"]);
  });

  it("treats a name that isn't a column as words", () => {
    expect(parseFilter("speed>3", columns)).toEqual([{ text: "speed>3" }]);
  });
});

describe("stats", () => {
  it("reads which the page asks for, and works them out", () => {
    expect(statsOf(undefined)).toEqual([]);
    expect(statsOf("")).toEqual(["avg", "min", "max"]);
    expect(statsOf("sum, avg")).toEqual(["sum", "avg"]);
    expect(stat("sum", [1, 2, 3])).toBe(6);
    expect(stat("avg", [1, 2])).toBe(1.5);
    expect(stat("max", [])).toBeNull();
    expect(formatStat(1.5)).toBe((1.5).toLocaleString());
    expect(formatStat(1_200_000)).toBe((1_200_000).toLocaleString(undefined, { notation: "compact" }));
  });
});
