import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addAnswer, listAnswers } from "./answers.ts";
import { addMessage, closeAll, createThread, listThreads, startedBy, waitingForAgent } from "./threads.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shiori-threads-"));
});
afterEach(() => {
  closeAll();
  rmSync(root, { recursive: true, force: true });
});

describe("authors", () => {
  it("move a database from before guests to one with authors, keeping everything", () => {
    mkdirSync(join(root, "data"));
    const old = new DatabaseSync(join(root, "data", "wiki.db"));
    old.exec(`
      create table threads (id integer primary key, page text not null, quote text not null,
        status text not null default 'open' check (status in ('open', 'resolved', 'wontfix')),
        created_at text not null, resolved_at text);
      create table messages (id integer primary key,
        thread_id integer not null references threads(id) on delete cascade,
        author text not null check (author in ('user', 'agent')), body text not null, created_at text not null);
      create table answers (id integer primary key, page text not null, question text not null, choice text,
        body text not null default '', created_at text not null);
      insert into threads values (7, 'plan', '{"exact":"x","prefix":"","suffix":""}', 'open', '2026-10-01', null);
      insert into messages values (3, 7, 'user', 'Hi', '2026-10-01'), (4, 7, 'agent', 'Hello', '2026-10-02');
      insert into answers values (1, 'plan', 'q1', 'Steam', '', '2026-10-03');
      pragma user_version = 2;`);
    old.close();

    const [t] = listThreads(root);
    expect(t.id).toBe(7);
    expect(t.messages.map((m) => [m.id, m.author, m.body])).toEqual([
      [3, "user", "Hi"],
      [4, "agent", "Hello"],
    ]);
    expect(listAnswers(root)[0]).toMatchObject({ id: 1, author: "user", choice: "Steam" });
    addMessage(root, 7, { guest: "g1", name: "Ana" }, "Me too");
    expect(listThreads(root)[0].messages.at(-1)).toMatchObject({ id: 5, author: "guest", name: "Ana", guestId: "g1" });
  });

  it("know who started a thread, and wait for the agent after a guest speaks", () => {
    const t = createThread(root, "", { exact: "", prefix: "", suffix: "" }, "Hey", { guest: "g1", name: "Ana" });
    expect(startedBy(t)).toBe("g1");
    expect(waitingForAgent(listThreads(root))).toHaveLength(1);
    addMessage(root, t.id, "agent", "Done");
    expect(waitingForAgent(listThreads(root))).toHaveLength(0);
    expect(addAnswer(root, "plan", "q1", null, "Later", { guest: "g2", name: "Bo" })).toMatchObject({
      author: "guest",
      name: "Bo",
      guestId: "g2",
    });
  });
});
