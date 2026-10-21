// Who else is on the wiki, Google Docs style (ADR-0005): their avatars in the header; a click opens the list, and
// a click on someone goes to the page they're on.
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Person } from "../../shared/api.ts";
import { Avatar, Popover, PopoverContent, PopoverTrigger, Tooltip } from "../ui/index.ts";
import { SPECIALS } from "../wiki/special/specials.ts";
import "./presence.css";

/** Avatars shown before the rest fold into "+N". */
const SHOWN = 4;

/** Where someone is, in words. */
function placeOf(p: Person): string {
  if (p.page === null) return "a page that isn't written yet";
  if (p.page === "_" || p.page.startsWith("_/")) {
    const route = p.page.slice(2).split("/")[0];
    return SPECIALS.find((s) => s.route === route)?.title ?? "a special page";
  }
  return p.title ?? p.page;
}

const nameOf = (p: Person) => (p.me ? `${p.name} (you)` : p.name);

export function PresenceBar({ wikiId, people }: { wikiId: string; people: Person[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const others = people.filter((p) => !p.me);
  if (!others.length) return null;
  const go = (p: Person) => {
    setOpen(false);
    if (p.page === null) return;
    navigate(p.page ? `/w/${wikiId}/${p.page.split("/").map(encodeURIComponent).join("/")}` : `/w/${wikiId}`);
  };
  const label = `${others.length} other${others.length === 1 ? "" : "s"} here: ${others.map((p) => p.name).join(", ")}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={label} side="bottom">
        <PopoverTrigger asChild>
          <button type="button" className="sh-presence" aria-label={label}>
            {others.slice(0, SHOWN).map((p) => (
              <Avatar key={p.id} id={p.id} name={p.name} size={26} host={p.role === "host"} />
            ))}
            {others.length > SHOWN && <span className="sh-presence-more">+{others.length - SHOWN}</span>}
          </button>
        </PopoverTrigger>
      </Tooltip>
      {/* Back on the avatars after a jump, focus would only pop their tooltip over the new page. */}
      <PopoverContent width={300} align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        <p className="sh-presence-title">On this wiki now</p>
        <ul className="sh-presence-list">
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="sh-presence-person"
                disabled={p.me || p.page === null}
                onClick={() => go(p)}
              >
                <Avatar id={p.id} name={p.name} size={30} ring={p.me} host={p.role === "host"} />
                <span className="sh-presence-who">
                  <span className="sh-presence-name">
                    {nameOf(p)}
                    {p.name.toLowerCase() !== p.role && (
                      <span className="sh-presence-role">{p.role === "host" ? "Host" : "Guest"}</span>
                    )}
                  </span>
                  <span className="sh-presence-where">on {placeOf(p)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="sh-presence-hint">Click someone to go to their page.</p>
      </PopoverContent>
    </Popover>
  );
}
