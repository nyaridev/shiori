import { describe, expect, it } from "vitest";
import { diffFiles, diffLines, diffWords, editScript } from "./diff.ts";

const apply = (a: string[], b: string[], ops: ("same" | "add" | "del")[]) => {
  const out: string[] = [];
  let i = 0;
  let j = 0;
  for (const op of ops) {
    if (op === "same") {
      expect(a[i]).toBe(b[j]);
      out.push(a[i++]);
      j++;
    } else if (op === "del") i++;
    else out.push(b[j++]);
  }
  return out;
};

describe("editScript", () => {
  it("turns one list into the other in the fewest edits", () => {
    const a = "abcabba".split("");
    const b = "cbabac".split("");
    const ops = editScript(a, b);
    expect(apply(a, b, ops)).toEqual(b);
    expect(ops.filter((o) => o !== "same")).toHaveLength(5);
  });

  it("handles empty sides and equal lists", () => {
    expect(editScript([], ["x"])).toEqual(["add"]);
    expect(editScript(["x"], [])).toEqual(["del"]);
    expect(editScript(["x", "y"], ["x", "y"])).toEqual(["same", "same"]);
  });

  it("holds for random edits", () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let n = 0; n < 50; n++) {
      const a = Array.from({ length: Math.floor(rand() * 30) }, () => "abcd"[Math.floor(rand() * 4)]);
      const b = Array.from({ length: Math.floor(rand() * 30) }, () => "abcd"[Math.floor(rand() * 4)]);
      expect(apply(a, b, editScript(a, b))).toEqual(b);
    }
  });
});

describe("diffFiles", () => {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");

  it("numbers lines on both sides", () => {
    const lines = diffLines("a\nb\nc\n", "a\nB\nc\n");
    expect(lines).toEqual([
      { kind: "same", text: "a", old: 1, new: 1 },
      { kind: "del", text: "b", old: 2 },
      { kind: "add", text: "B", new: 2 },
      { kind: "same", text: "c", old: 3, new: 3 },
    ]);
  });

  it("cuts changes into hunks with context, counting what's skipped", () => {
    const after = before.replace("line 2\n", "line two\n").replace("line 18", "line eighteen");
    const diff = diffFiles(before, after, 2);
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(2);
    expect(diff.hunks).toHaveLength(2);
    expect(diff.hunks[0].skipped).toBe(0);
    expect(diff.hunks[0].lines[0].text).toBe("line 1");
    expect(diff.hunks[1].skipped).toBe(11);
    expect(diff.skippedAfter).toBe(0);
  });

  it("treats a new file as all added, and CRLF like LF", () => {
    expect(diffFiles("", "a\nb").added).toBe(2);
    expect(diffFiles("a\r\nb\r\n", "a\nb\n").hunks).toEqual([]);
  });
});

describe("diffWords", () => {
  it("marks only the words that changed", () => {
    const { removed, added } = diffWords("Rats have 20 health.", "Rats have 25 health.");
    expect(removed.filter((p) => p.changed).map((p) => p.text)).toEqual(["20"]);
    expect(added.filter((p) => p.changed).map((p) => p.text)).toEqual(["25"]);
    expect(added.map((p) => p.text).join("")).toBe("Rats have 25 health.");
  });
});
