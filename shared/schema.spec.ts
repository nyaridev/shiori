import { describe, expect, it } from "vitest";
import { FRONTMATTER_FIELDS, frontmatterSchema } from "./schema.ts";

describe("FRONTMATTER_FIELDS", () => {
  it("documents every frontmatter field, once", () => {
    const keys = FRONTMATTER_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(Object.keys(frontmatterSchema.shape).sort());
  });
});
