// Public links (ADR-0011, AGENTS.md rule 2): readers get the public edition's files and nothing else. Checked for the
// link kind, expiry, revoking, the app's API, pages that aren't public, limits and the security headers.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ShareInfo } from "../../shared/api.ts";
import { HOST, sharingFixture } from "./fixture.ts";
import { LIMITS } from "./limits.ts";
import type { Share } from "./shares.ts";

const s = sharingFixture();

function makePublic() {
  const root = join(s.app, "wikis", "alpha");
  writeFileSync(
    join(root, "wiki.json"),
    JSON.stringify({ schema: 1, id: "alpha", title: "ALPHA", public: { pages: ["mobs/**"] } }),
  );
  writeFileSync(join(root, "pages", "mobs.md"), "---\ntitle: Mobs\n---\nAll the mobs. :private[Secret spawn rate.]");
  s.emit({ type: "wikis" });
}

async function link(kind: "public" | "view" = "public", duration?: "1h") {
  const res = await s.owner("/api/shares", {
    method: "POST",
    body: { wiki: "alpha", kind, ...(duration ? { duration } : {}) },
  });
  expect(res.status).toBe(201);
  const info = (await res.json()) as ShareInfo;
  return { info, share: s.shares.list().find((x) => x.id === info.id) as Share };
}

const get = (path: string, ip = "198.51.100.4") =>
  s.guestApp.request(`${HOST}${path}`, { headers: { "cf-connecting-ip": ip } });

describe("public links", () => {
  it("serve the public edition under /p/, with no name asked", async () => {
    makePublic();
    const { info, share } = await link();
    expect(info.path).toBe(`/p/${share.token}/`);
    expect(info.url).toBe(`${HOST}/p/${share.token}/`);
    const front = await get(`/p/${share.token}/`);
    expect(front.status).toBe(200);
    expect(front.headers.get("content-type")).toContain("text/html");
    expect(front.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(front.headers.get("x-robots-tag")).toContain("noindex");
    expect(front.headers.get("set-cookie")).toBeNull();
    const mobs = await (await get(`/p/${share.token}/mobs.html`)).text();
    expect(mobs).toContain("All the mobs.");
    expect(mobs).not.toContain("Secret spawn rate");
    expect((await get(`/p/${share.token}/_site/style.css`)).status).toBe(200);
    expect(s.shares.info(share).views).toBe(2);
  });

  it("have nothing but the edition: no pages that aren't public, no API, no app", async () => {
    makePublic();
    const { share } = await link();
    for (const path of [
      "plan.html",
      "index.md",
      "api/wikis/alpha",
      "api/session",
      "../s/x",
      "wiki.json",
      "data/wiki.db",
    ]) {
      const res = await get(`/p/${share.token}/${path}`);
      expect(res.status, path).toBe(404);
      expect(await res.text(), path).not.toContain("The plan.");
    }
    // The wiki's API under the link's token answers nothing either.
    expect((await get(`/s/${share.token}/api/session`)).status).toBe(404);
    expect((await get(`/s/${share.token}/api/wikis/alpha`)).status).toBe(404);
  });

  it("aren't opened by other links' tokens, or after they end", async () => {
    makePublic();
    const view = await link("view");
    expect((await get(`/p/${view.share.token}/`)).status).toBe(404);
    expect((await get(`/p/${"x".repeat(43)}/`)).status).toBe(404);
    const timed = await link("public", "1h");
    s.clock += 2 * 3_600_000;
    expect((await get(`/p/${timed.share.token}/`)).status).toBe(410);
    const revoked = await link();
    await s.owner(`/api/shares/${revoked.info.id}`, { method: "DELETE" });
    expect((await get(`/p/${revoked.share.token}/`)).status).toBe(410);
  });

  it("slow down a reader who asks too fast", async () => {
    makePublic();
    const { share } = await link();
    let last = 0;
    for (let i = 0; i < LIMITS.reads.capacity + 1; i++) last = (await get(`/p/${share.token}/`, "192.0.2.9")).status;
    expect(last).toBe(429);
    expect((await get(`/p/${share.token}/`, "192.0.2.10")).status).toBe(200);
  });
});

describe("the owner's public wiki", () => {
  it("says what goes public, previews it and exports it", async () => {
    makePublic();
    const report = await (await s.owner("/api/wikis/alpha/public")).json();
    expect(report.pages.map((p: { path: string }) => p.path)).toEqual(["mobs"]);
    expect(report.removed.private).toBe(1);
    const preview = await s.owner("/api/wikis/alpha/public/site/mobs.html");
    expect(await preview.text()).toContain("All the mobs.");
    const zip = await s.owner("/api/wikis/alpha/public.zip");
    expect(zip.headers.get("content-type")).toBe("application/zip");
    expect(zip.headers.get("content-disposition")).toContain("alpha-public.zip");
  });
});
