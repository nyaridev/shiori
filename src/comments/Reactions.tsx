// Reactions under a message: each emoji with how many people used it (yours pressed), and a small picker to add
// one. Clicking your own takes it back. Who reacted shows on hover; guests see names, never ids.
import { useState } from "react";
import { type Message, REACTIONS, type ReactionEmoji, type Reactor } from "../../shared/api.ts";
import { canComment, useGuest } from "../guest/GuestContext.ts";
import { Icon } from "../ui/index.ts";
import "./reactions.css";

export function Reactions({
  message,
  onReact,
}: {
  message: Message;
  onReact: (emoji: ReactionEmoji, on: boolean) => Promise<void>;
}) {
  const guest = useGuest();
  const [picking, setPicking] = useState(false);
  const writes = canComment(guest);
  const isMine = (r: Reactor) => (guest ? !!r.mine : r.author === "user");
  const nameOf = (r: Reactor) => (isMine(r) ? "You" : (r.name ?? (r.author === "user" ? "Host" : "Guest")));
  const list = message.reactions ?? [];
  if (!list.length && !writes) return null;

  const toggle = (emoji: ReactionEmoji, on: boolean) => {
    setPicking(false);
    void onReact(emoji, on);
  };

  return (
    <div className="sh-reactions">
      {list.map((r) => {
        const mine = r.by.some(isMine);
        return (
          <button
            key={r.emoji}
            type="button"
            className="sh-reaction"
            aria-pressed={mine}
            disabled={!writes}
            title={r.by.map(nameOf).join(", ")}
            aria-label={`${r.emoji} ${r.by.length}: ${r.by.map(nameOf).join(", ")}`}
            onClick={() => toggle(r.emoji, !mine)}
          >
            <span aria-hidden="true">{r.emoji}</span>
            <span className="sh-reaction-count">{r.by.length}</span>
          </button>
        );
      })}
      {writes &&
        (picking ? (
          <fieldset className="sh-reaction-picker">
            <legend className="sh-sr-only">Pick a reaction</legend>
            {REACTIONS.map((emoji) => {
              const mine = list.find((r) => r.emoji === emoji)?.by.some(isMine) ?? false;
              return (
                <button
                  key={emoji}
                  type="button"
                  className="sh-reaction-pick"
                  aria-pressed={mine}
                  aria-label={`React with ${emoji}`}
                  onClick={() => toggle(emoji, !mine)}
                >
                  {emoji}
                </button>
              );
            })}
            <button
              type="button"
              className="sh-reaction-pick"
              aria-label="Close the reactions"
              onClick={() => setPicking(false)}
            >
              <Icon name="close" size={13} />
            </button>
          </fieldset>
        ) : (
          <button
            type="button"
            className="sh-reaction sh-reaction-add"
            aria-label="Add a reaction"
            title="Add a reaction"
            onClick={() => setPicking(true)}
          >
            <Icon name="plus" size={13} />
          </button>
        ))}
    </div>
  );
}
