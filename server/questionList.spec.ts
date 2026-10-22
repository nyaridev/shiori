import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Answer, QuestionPage, QuestionsWaiting, WikiIndex } from "../shared/api.ts";
import { addAnswer, setAnswerHidden } from "./answers.ts";
import { sharingFixture } from "./sharing/fixture.ts";

const s = sharingFixture();
const alpha = () => join(s.app, "wikis", "alpha");
const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
const tick = () => new Promise((r) => setTimeout(r, 5));

/** A plan with two open questions (one due), a decided one and a suggestion; and a page of many questions. */
function questions(many = 0) {
  writeFileSync(
    join(alpha(), "pages", "plan.md"),
    [
      "---",
      "title: Plan",
      "questions:",
      "  - id: q1",
      "    text: Which platform first?",
      "    options: [Steam, itch.io]",
      "  - id: q2",
      "    text: Who designs the logo?",
      "    status: resolved",
      "    answer: Nari",
      "    decided: 2026-10-20",
      "  - id: q3",
      "    text: When is the demo?",
      "    due: 2026-11-15",
      "  - id: q4",
      "    text: Which engine?",
      "    status: resolved",
      "    answer: Godot",
      "    decided: 2026-10-22",
      "suggestions:",
      "  - id: s1",
      "    text: Add a roadmap page",
      "---",
      "The plan.",
    ].join("\n"),
  );
  if (many)
    writeFileSync(
      join(alpha(), "pages", "zoo.md"),
      [
        "---",
        "title: Zoo",
        "questions:",
        ...Array.from({ length: many }, (_, i) => `  - id: z${i}\n    text: Animal ${i}?`),
        "---",
        "Animals.",
      ].join("\n"),
    );
  s.emit({ type: "pages", wiki: "alpha" });
}

const list = (query = "") => json<QuestionPage>(s.owner(`/api/wikis/alpha/questions?${query}`));
const ids = (page: QuestionPage) => page.items.map((q) => q.id);

describe("the question list", () => {
  it("lists open questions, soonest due first, then in reading order, with counts of each kind", async () => {
    questions();
    const open = await list();
    expect(ids(open)).toEqual(["q3", "q1", "s1"]);
    expect(open.counts).toEqual({
      open: { question: 2, suggestion: 1 },
      decided: 2,
      waiting: { question: 2, suggestion: 1 },
      answered: 0,
    });
    expect(ids(await list("kind=suggestion"))).toEqual(["s1"]);
    expect(ids(await list("status=decided"))).toEqual(["q4", "q2"]);
    expect((await list("status=decided")).items[0].decidedOn).toBe("2026-10-22");
    expect(ids(await list("status=all"))).toEqual(["q3", "q1", "s1", "q4", "q2"]);
  });

  it("sends a page at a time, never more than 50", async () => {
    questions(120);
    const first = await list("kind=question&limit=20");
    expect(first.total).toBe(122);
    expect(first.items).toHaveLength(20);
    const third = await list("kind=question&limit=20&offset=40");
    expect(third.offset).toBe(40);
    expect(third.items[0].id).toBe("z38");
    expect((await list("limit=500")).items).toHaveLength(50);
    expect((await list("offset=9999")).items).toEqual([]);
    expect((await list("limit=nope&offset=-3")).items).toHaveLength(20);
  });

  it("searches the question, its options, its decision and its page, every word", async () => {
    questions(3);
    expect(ids(await list("q=steam"))).toEqual(["q1"]);
    expect(ids(await list("status=all&q=godot"))).toEqual(["q4"]);
    expect(ids(await list("q=zoo animal"))).toEqual(["z0", "z1", "z2"]);
    expect((await list("q=steam")).counts.open).toEqual({ question: 1, suggestion: 0 });
    expect((await list("q=nothing")).total).toBe(0);
  });

  it("keeps what the viewer answered during the visit in the waiting list, and the rest under answered", async () => {
    questions();
    addAnswer(alpha(), "plan", "q1", "Steam", "before");
    await tick();
    const visit = await list("mine=waiting");
    expect(ids(visit)).toEqual(["q3", "s1"]);
    expect(visit.counts.waiting).toEqual({ question: 1, suggestion: 1 });
    await tick();
    addAnswer(alpha(), "plan", "q3", null, "in December");
    const since = `since=${encodeURIComponent(visit.at)}`;
    const still = await list(`mine=waiting&${since}`);
    expect(ids(still)).toEqual(["q3", "s1"]);
    expect(still.items[0].mine?.body).toBe("in December");
    expect(still.counts.waiting).toEqual({ question: 0, suggestion: 1 });
    expect(ids(await list(`mine=answered&${since}`))).toEqual(["q1"]);
    // Coming back later: both are answered.
    expect(ids(await list("mine=waiting"))).toEqual(["s1"]);
    expect(ids(await list("mine=answered"))).toEqual(["q3", "q1"]);
  });

  it("sends every answer for cards, the ones the owner hid only to the owner", async () => {
    questions();
    addAnswer(alpha(), "plan", "q1", "Steam", "");
    const spam = addAnswer(alpha(), "plan", "q1", "itch.io", "spam", { guest: "g1", name: "Bo" });
    setAnswerHidden(alpha(), spam.id, true);
    const full = await list("full=1&q=platform");
    expect(full.items[0].answerList?.map((a) => a.body)).toEqual(["", "spam"]);
    expect(full.items[0].answers).toBe(1);
    expect((await list("q=platform")).items[0].answerList).toBeUndefined();
  });

  it("says what waits on each page, and the index only counts", async () => {
    questions(2);
    addAnswer(alpha(), "plan", "q1", "Steam", "");
    expect(await json<QuestionsWaiting>(s.owner("/api/wikis/alpha/questions/waiting"))).toEqual({
      pages: { plan: { questions: 1, suggestions: 1 }, zoo: { questions: 2, suggestions: 0 } },
    });
    const index = await json<WikiIndex>(s.owner("/api/wikis/alpha/pages"));
    expect(index.questions).toEqual({ open: 4, suggestions: 1, decided: 2 });
  });
});

// AGENTS.md rule 2: a guest route is checked for the link, other wikis, expiry, view links, limits and Origin.
describe("the question list for guests", () => {
  it("is there on view and comment links, for the link's own wiki, after a name", async () => {
    questions();
    const b = s.browser(s.shares.create({ wiki: "alpha", kind: "view" }));
    expect((await b.get("/api/wikis/alpha/questions")).status).toBe(401);
    expect((await b.get("/api/wikis/alpha/questions/waiting")).status).toBe(401);
    await b.join("Mika");
    expect(ids(await json<QuestionPage>(b.get("/api/wikis/alpha/questions")))).toEqual(["q3", "q1", "s1"]);
    expect((await b.get("/api/wikis/beta/questions")).status).toBe(404);
    expect((await b.get("/api/wikis/beta/questions/waiting")).status).toBe(404);
  });

  it("marks the guest's own answers, hides what the owner hid and never shows guest ids", async () => {
    questions();
    const share = s.shares.create({ wiki: "alpha", kind: "comment" });
    const bo = s.browser(share);
    const mika = s.browser(share, "198.51.100.2");
    await bo.join("Bo");
    await mika.join("Mika");
    const sent = await json<Answer>(
      bo.send("POST", "/api/wikis/alpha/answers", { page: "plan", question: "q1", choice: "Steam" }),
    );
    await mika.send("POST", "/api/wikis/alpha/answers", { page: "plan", question: "q3", body: "soon" });
    addAnswer(alpha(), "plan", "q1", "itch.io", "", "user");

    const seen = await json<QuestionPage>(bo.get("/api/wikis/alpha/questions?full=1&kind=question"));
    const q1 = seen.items.find((q) => q.id === "q1");
    expect(q1?.mine).toMatchObject({ id: sent.id, mine: true, choice: "Steam" });
    expect(q1?.answerList?.map((a) => [a.name, a.mine])).toEqual([
      ["Bo", true],
      [expect.any(String), false],
    ]);
    expect(seen.items.find((q) => q.id === "q3")?.mine).toBeUndefined();
    expect(JSON.stringify(seen)).not.toMatch(/guestId|"hidden"/);
    expect(ids(await json<QuestionPage>(bo.get("/api/wikis/alpha/questions?mine=waiting")))).toEqual(["q3", "s1"]);
    expect(await json<QuestionsWaiting>(bo.get("/api/wikis/alpha/questions/waiting"))).toEqual({
      pages: { plan: { questions: 1, suggestions: 1 } },
    });

    setAnswerHidden(alpha(), sent.id, true);
    const after = await json<QuestionPage>(mika.get("/api/wikis/alpha/questions?full=1&q=platform"));
    expect(after.items[0].answerList?.map((a) => a.choice)).toEqual(["itch.io"]);
    expect(after.items[0].answers).toBe(1);
  });

  it("ends with the link", async () => {
    questions();
    const b = s.browser(s.shares.create({ wiki: "alpha", kind: "comment", duration: "1h" }));
    await b.join("Mika");
    s.clock += 2 * 3_600_000;
    expect((await b.get("/api/wikis/alpha/questions")).status).toBe(410);
    expect((await b.get("/api/wikis/alpha/questions/waiting")).status).toBe(410);
  });

  it("counts toward the read limit and takes no writes", async () => {
    questions();
    const b = s.browser(s.shares.create({ wiki: "alpha", kind: "comment" }));
    await b.join("Mika");
    expect((await b.send("POST", "/api/wikis/alpha/questions", {})).status).toBe(404);
    expect((await b.send("POST", "/api/wikis/alpha/questions", {}, { origin: "https://evil.test" })).status).not.toBe(
      200,
    );
    let limited = false;
    for (let i = 0; i < 60 && !limited; i++) limited = (await b.get("/api/wikis/alpha/questions")).status === 429;
    expect(limited).toBe(true);
  });
});
