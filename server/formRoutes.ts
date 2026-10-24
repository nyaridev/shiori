// The owner's routes for page forms (ADR-0015), under `/api/wikis/:id/forms`: a page's forms with what's written in
// them, and writing one field. Only the owner's server has them; guests never see a page's forms.
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { PageData } from "../shared/api.ts";
import { pageForms, setFormValue } from "./forms.ts";
import type { Wiki } from "./registry.ts";

const valueSchema = z.strictObject({
  page: z.string().max(300),
  field: z.string().min(1).max(40),
  value: z.unknown(),
});

export function ownerFormRoutes(
  wikiOf: (c: Context) => Wiki | Response,
  pageOf: (w: Wiki, path: string) => PageData | undefined,
) {
  const app = new Hono();

  app.get("/", (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const page = pageOf(w, c.req.query("page") ?? "");
    if (!page) return c.json({ error: "no such page" }, 404);
    return c.json({ forms: pageForms(w.root, page) });
  });

  app.put("/:form", async (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const body = valueSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad request" }, 400);
    const page = pageOf(w, body.data.page);
    if (!page) return c.json({ error: "no such page" }, 404);
    const done = setFormValue(w.root, page, c.req.param("form"), body.data.field, body.data.value);
    if ("error" in done) return c.json({ error: done.error }, done.status);
    return c.json({ value: "saved" in done ? done.saved : done.unchanged });
  });

  return app;
}
