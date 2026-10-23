// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GuestSession, Message, Thread } from "../../shared/api.ts";
import { GuestContext } from "../guest/GuestContext.ts";
import { ThreadCard } from "./ThreadCard.tsx";
import { ThreadList } from "./ThreadList.tsx";
import type { Threads } from "./useThreads.ts";

const thread = (id: number, status: Thread["status"], body: string): Thread => ({
  id,
  page: "plan",
  quote: { exact: `quoted ${id}`, prefix: "", suffix: "" },
  status,
  createdAt: "2026-10-01T10:00:00.000Z",
  resolvedAt: status === "open" ? null : "2026-10-02T10:00:00.000Z",
  messages: [{ id: id * 10, author: "user", body, createdAt: "2026-10-01T10:00:00.000Z" }],
});

const threads = (list: Thread[]): Threads => ({
  wikiId: "spec",
  threads: list,
  create: vi.fn(),
  reply: vi.fn(),
  setStatus: vi.fn(),
  hide: vi.fn(),
  edit: vi.fn(),
  react: vi.fn(),
  remove: vi.fn(),
});

/** The rail as PageArea uses it: the open thread is the page's state. */
function Rail({ list, startActive = null }: { list: Thread[]; startActive?: number | null }) {
  const [active, setActive] = useState<number | null>(startActive);
  return <ThreadList threads={threads(list)} anchors={new Map()} active={active} onActivate={setActive} />;
}

// The filter is a radio group (Segmented): a click picks.
const pick = (name: RegExp) => fireEvent.click(screen.getByRole("radio", { name }));

/** Opens a card's ⋯ menu (Radix opens it from the keyboard in tests) and answers its items' names. */
function menu(label = "Actions for this comment") {
  fireEvent.keyDown(screen.getByRole("button", { name: label }), { key: "Enter" });
  return screen.queryAllByRole("menuitem").map((el) => el.textContent);
}

afterEach(cleanup);

describe("the comments rail", () => {
  it("switches to Closed and back while a comment is open, keeping the unsent reply", () => {
    render(<Rail list={[thread(1, "open", "Is this right?"), thread(2, "resolved", "Fixed typo")]} />);
    fireEvent.click(screen.getByText("Is this right?"));
    expect(screen.queryByPlaceholderText("Reply…")).toBeNull();
    menu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Reply" }));
    fireEvent.change(screen.getByPlaceholderText("Reply…"), { target: { value: "half a reply" } });

    pick(/Closed/);
    expect(screen.getByRole("radio", { name: /Closed/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Fixed typo")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Reply…")).toBeNull();

    pick(/Open/);
    expect((screen.getByPlaceholderText("Reply…") as HTMLTextAreaElement).value).toBe("half a reply");
  });

  it("shows a closed comment opened from the page under Closed", () => {
    render(<Rail list={[thread(3, "open", "Still open"), thread(4, "resolved", "Done one")]} startActive={4} />);
    expect(screen.getByRole("radio", { name: /Closed/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Done one")).toBeTruthy();
  });
});

const guest = (kind: GuestSession["kind"]): GuestSession => ({
  wiki: { id: "spec", title: "Spec" },
  kind,
  expiresAt: null,
  guest: { name: "Ana" },
  host: "Host",
});
const by = (who: Partial<Message>): Thread => ({
  ...thread(5, "open", "Add a map"),
  messages: [
    { id: 50, author: "guest", name: "Ana", body: "Add a map", createdAt: "2026-10-01T10:00:00.000Z", ...who },
  ],
});

function Card({ t, as }: { t: Thread; as: GuestSession | null }) {
  const [active, setActive] = useState(false);
  return (
    <GuestContext.Provider value={as}>
      <ThreadCard
        thread={t}
        orphaned={false}
        active={active}
        threads={threads([t])}
        onClick={() => setActive((a) => !a)}
      />
    </GuestContext.Provider>
  );
}

describe("the card's menu", () => {
  it("gives a guest everything on their own thread", () => {
    render(<Card t={by({ mine: true })} as={guest("comment")} />);
    expect(menu()).toEqual(["Reply", "Edit", "Resolve", "Remove"]);
  });

  it("lets a guest only reply on someone else's", () => {
    render(<Card t={by({ name: "Bo" })} as={guest("comment")} />);
    expect(menu()).toEqual(["Reply"]);
  });

  it("has nothing for a view link, so there's no ⋯ at all", () => {
    render(<Card t={by({ mine: true })} as={guest("view")} />);
    expect(screen.queryByRole("button", { name: "Actions for this comment" })).toBeNull();
  });

  it("lets the host resolve, hide and remove a guest's thread, but not edit it", () => {
    render(<Card t={by({})} as={null} />);
    expect(menu()).toEqual(["Reply", "Resolve", "Hide from guests", "Remove"]);
  });

  it("lets the host edit their own, and asks before removing", () => {
    const t = by({ author: "user", name: undefined });
    const list = threads([t]);
    function Own() {
      const [active, setActive] = useState(false);
      return (
        <ThreadCard thread={t} orphaned={false} active={active} threads={list} onClick={() => setActive((a) => !a)} />
      );
    }
    render(<Own />);
    expect(menu()).toEqual(["Reply", "Edit", "Resolve", "Remove"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(screen.getByRole("alert").textContent).toContain("Remove it for everyone?");
    expect(list.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(list.remove).toHaveBeenCalledWith(5);
  });
});
