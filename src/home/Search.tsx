// Type anywhere on the deck and a search line fades in above the middle card. Just an underline, no icons. While
// it's empty it's invisible and can't be clicked. Typing spins the deck to the best match; Enter opens it, Esc clears.
import { useEffect, useRef } from "react";
import "./search.css";

interface Props {
  query: string;
  onChange: (query: string) => void;
  /** Whether anything matches, for the underline's color. */
  found: boolean;
  onSubmit: () => void;
  disabled: boolean;
}

export function Search({ query, onChange, found, onSubmit, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const live = useRef({ query, onChange, disabled });
  live.current = { query, onChange, disabled };

  // Keys typed anywhere on the page start (or continue) the search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { query, onChange, disabled } = live.current;
      if (disabled || e.ctrlKey || e.metaKey || e.altKey || e.target === input.current) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Space still opens the centered card until something has been typed.
      const printable = e.key.length === 1 && (e.key !== " " || query !== "");
      if (printable) onChange(query + e.key);
      else if (e.key === "Backspace" && query) onChange(query.slice(0, -1));
      else return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = query !== "" && !disabled;
  useEffect(() => {
    if (!visible) input.current?.blur();
  }, [visible]);

  return (
    <div className="deck-search" data-visible={visible || undefined} data-missing={(visible && !found) || undefined}>
      <input
        ref={input}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
          else if (e.key === "Escape") onChange("");
          else return;
          e.preventDefault();
        }}
        tabIndex={visible ? 0 : -1}
        aria-label="Search wikis"
        aria-hidden={!visible}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}
