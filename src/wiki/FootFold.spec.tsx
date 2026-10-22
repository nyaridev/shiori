// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { FootFold, openFoot } from "./FootFold.tsx";

const fold = (at = "/w/demo/plan") =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <FootFold id="questions" title="Questions" count="2 open" holds={["question-q1"]}>
        <p>What's the core feature?</p>
      </FootFold>
    </MemoryRouter>,
  );

const bar = () => screen.getByRole("button", { name: /Questions/ });

afterEach(cleanup);

describe("FootFold", () => {
  it("starts folded, with its count on the bar, and opens and folds on a click", () => {
    fold();
    expect(bar().getAttribute("aria-expanded")).toBe("false");
    expect(bar().textContent).toContain("2 open");
    expect(screen.getByText("What's the core feature?").closest("[hidden]")).not.toBeNull();
    fireEvent.click(bar());
    expect(bar().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("What's the core feature?").closest("[hidden]")).toBeNull();
    fireEvent.click(bar());
    expect(bar().getAttribute("aria-expanded")).toBe("false");
  });

  it("opens when a link leads to it or to something it holds", () => {
    fold("/w/demo/plan#question-q1");
    expect(bar().getAttribute("aria-expanded")).toBe("true");
    cleanup();
    fold("/w/demo/plan#suggestions");
    expect(bar().getAttribute("aria-expanded")).toBe("false");
  });

  it("opens when asked, and only for its own targets", () => {
    fold();
    act(() => openFoot("changes"));
    expect(bar().getAttribute("aria-expanded")).toBe("false");
    act(() => openFoot("questions"));
    expect(bar().getAttribute("aria-expanded")).toBe("true");
  });
});
