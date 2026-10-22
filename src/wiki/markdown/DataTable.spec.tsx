// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataTableEl } from "./DataTable.tsx";
import { TableEl } from "./elements.tsx";

afterEach(cleanup);

const MOBS = [
  ["Rat", "20"],
  ["Wolf", "30"],
  ["Slime", "5"],
  ["Bat", "8"],
  ["Golem", "120"],
  ["Ghost", ""],
];

/** A data table as the page's hast becomes it: `sh-table` around the table component. */
function Mobs(props: { sort?: string; stats?: string }) {
  return (
    <DataTableEl caption="Mobs" {...props}>
      <TableEl>
        <thead>
          <tr>
            <th>Name</th>
            <th>HP</th>
          </tr>
        </thead>
        <tbody>
          {MOBS.map(([name, hp]) => (
            <tr key={name}>
              <td>
                <a href={`/w/demo/mobs/${name.toLowerCase()}`}>{name}</a>
              </td>
              <td>{hp}</td>
            </tr>
          ))}
        </tbody>
      </TableEl>
    </DataTableEl>
  );
}

const names = () => screen.getAllByRole("link").map((a) => a.textContent);

describe("DataTableEl", () => {
  it("keeps the page's order until a column is clicked, then sorts up, down and back", () => {
    render(<Mobs />);
    expect(names()).toEqual(["Rat", "Wolf", "Slime", "Bat", "Golem", "Ghost"]);
    const hp = screen.getByRole("button", { name: /HP/ });
    fireEvent.click(hp);
    expect(names()).toEqual(["Slime", "Bat", "Rat", "Wolf", "Golem", "Ghost"]);
    expect(screen.getByRole("columnheader", { name: /HP/ }).getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(hp);
    expect(names()).toEqual(["Golem", "Wolf", "Rat", "Bat", "Slime", "Ghost"]);
    fireEvent.click(hp);
    expect(names()).toEqual(["Rat", "Wolf", "Slime", "Bat", "Golem", "Ghost"]);
  });

  it("starts sorted when the page says so", () => {
    render(<Mobs sort="-hp" />);
    expect(names()[0]).toBe("Golem");
  });

  it("filters, counts what's shown and works out stats over it", () => {
    render(<Mobs stats="avg, max" />);
    fireEvent.change(screen.getByLabelText("Filter the rows"), { target: { value: "hp>10" } });
    expect(names()).toEqual(["Rat", "Wolf", "Golem"]);
    expect(screen.getByText("3 of 6")).toBeTruthy();
    const foot = screen
      .getAllByRole("row")
      .slice(-2)
      .map((r) => r.textContent);
    const average = (170 / 3).toLocaleString(undefined, { maximumFractionDigits: 2 });
    expect(foot).toEqual([`Average${average}`, "Highest120"]);
    fireEvent.change(screen.getByLabelText("Filter the rows"), { target: { value: "dragon" } });
    expect(screen.getByText(/No row matches/)).toBeTruthy();
  });
});
