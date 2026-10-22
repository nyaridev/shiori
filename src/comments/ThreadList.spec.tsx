// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "../../shared/api.ts";
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

afterEach(cleanup);

describe("the comments rail", () => {
  it("switches to Closed and back while a comment is open, keeping the unsent reply", () => {
    render(<Rail list={[thread(1, "open", "Is this right?"), thread(2, "resolved", "Fixed typo")]} />);
    fireEvent.click(screen.getByText("Is this right?"));
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
