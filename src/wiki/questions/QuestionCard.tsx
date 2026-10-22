// A question a page asks (ADR-0002), or a suggestion the agent made for it: the same card, amber for a question about
// what's there and green for an idea to add or improve. Pick an option and/or write a note, and the agent sees it in
// its inbox. Each
// person has one answer, which they can change while the question is open; the card says whether it's still waiting
// for the agent. Options show how many people picked them. Once the agent writes the decision into the page, the
// card shows it. Everything but the question and the decision is `data-noquote`: answers and counts change, and
// comments anchor to the page's own words.
import { useState } from "react";
import type { Answer, Question } from "../../../shared/api.ts";
import { authorName, canComment, useGuest } from "../../guest/GuestContext.ts";
import { ago } from "../../lib/time.ts";
import { Badge, type BadgeTone, Button, IconButton, Textarea } from "../../ui/index.ts";
import { usePage } from "../PageContext.ts";
import "./questions.css";
import { PageIcon } from "../PageIcon.tsx";

const DAY = 86_400_000;

/** A `2026-11-15` day, as "15 Nov" (with the year when it isn't this one). */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  const year = d.getFullYear() === new Date().getFullYear() ? undefined : "numeric";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year });
}

/** How close a due day is: past it, within two days, or later. */
function dueTone(day: string): BadgeTone {
  const left = new Date(`${day}T23:59:59`).getTime() - Date.now();
  return left < 0 ? "bad" : left < 2 * DAY ? "warn" : "neutral";
}

export function QuestionCard({ question }: { question: Question }) {
  const ctx = usePage();
  const guest = useGuest();
  const answers = ctx?.answers.filter((a) => a.question === question.id) ?? [];
  const mine: Answer | undefined = answers.find((a) => (guest ? a.mine : a.author === "user"));
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const decided = question.status === "resolved";
  const canSend = !!ctx && (choice !== null || note.trim().length > 0) && state !== "sending";
  const writes = canComment(guest) && !ctx?.readOnly;
  const showForm = !decided && writes && (!mine || editing);
  // How many people picked each option (what the owner hid doesn't count).
  // Everyone else's answers; yours shows above, with its state.
  const others = answers.filter((a) => a !== mine);
  const picks = new Map<string, number>();
  for (const a of answers) if (a.choice && !a.hidden) picks.set(a.choice, (picks.get(a.choice) ?? 0) + 1);

  const change = () => {
    setChoice(mine?.choice ?? null);
    setNote(mine?.body ?? "");
    setEditing(true);
  };

  const send = async () => {
    if (!ctx || !canSend) return;
    setState("sending");
    try {
      await ctx.answer(question.id, choice, note.trim());
      setChoice(null);
      setNote("");
      setEditing(false);
      setState("sent");
    } catch {
      setState("failed");
    }
  };

  return (
    <section
      className="sh-question"
      id={`question-${question.id}`}
      data-kind={question.kind}
      data-decided={decided || undefined}
    >
      <header className="sh-question-head">
        <span className="sh-question-kicker" data-noquote="">
          <PageIcon
            icon={decided ? "checklist" : question.kind === "suggestion" ? "bulb" : "question"}
            className="sh-icon-gap"
          />
          {decided ? "Decided" : question.kind === "suggestion" ? "Suggestion" : "Question"}
        </span>
        <span className="sh-question-badges" data-noquote="">
          {decided && question.decided && <Badge tone="good">{dayLabel(question.decided)}</Badge>}
          {!decided && question.due && (
            <Badge tone={dueTone(question.due)} title={`Decide by ${question.due}`}>
              Decide by {dayLabel(question.due)}
            </Badge>
          )}
          {!decided && answers.length > 0 && (
            <Badge tone="accent">
              {answers.length} answer{answers.length === 1 ? "" : "s"}
            </Badge>
          )}
        </span>
      </header>
      <p className="sh-question-text">{question.text}</p>

      {decided && question.answer && <p className="sh-question-answer">{question.answer}</p>}

      {/* Your answer, and where it stands. */}
      {mine && !showForm && (
        <div className="sh-question-mine" data-noquote="">
          <span className="sh-question-mine-text">
            <span className="sh-question-by">Your answer</span>
            {mine.choice && <span className="sh-question-choice">{mine.choice}</span>}
            {mine.body && <span>{mine.body}</span>}
          </span>
          <span className="sh-question-mine-state">
            {decided ? (
              <Badge tone="good">Decided</Badge>
            ) : (
              <Badge title="The agent reads answers in its inbox and writes the decision into the page">
                Waiting for the agent
              </Badge>
            )}
            {!decided && writes && (
              <Button size="sm" variant="ghost" icon="undo" onClick={change}>
                Change
              </Button>
            )}
          </span>
        </div>
      )}

      {showForm && (
        <div className="sh-question-form" data-noquote="">
          {question.options.length > 0 && (
            <fieldset className="sh-question-options">
              <legend className="sh-sr-only">Options</legend>
              {question.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  className="sh-question-option"
                  aria-pressed={choice === o}
                  onClick={() => setChoice((c) => (c === o ? null : o))}
                >
                  {o}
                  {!!picks.get(o) && (
                    <span className="sh-question-count" title={`${picks.get(o)} picked this`}>
                      {picks.get(o)}
                    </span>
                  )}
                </button>
              ))}
            </fieldset>
          )}
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={question.options.length ? "Why? (optional)" : "Your answer"}
            aria-label={`Answer: ${question.text}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
            }}
          />
          <div className="sh-question-actions">
            <span className="sh-question-hint">
              {state === "failed" ? "Couldn't send. Try again." : "Answers go to the agent's inbox."}
            </span>
            <span className="sh-question-buttons">
              {editing && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
              <Button size="sm" variant="solid" disabled={!canSend} onClick={() => void send()}>
                {mine ? "Update answer" : "Send answer"}
              </Button>
            </span>
          </div>
        </div>
      )}

      {/* Options' counts where the form isn't shown. */}
      {!showForm && question.options.length > 0 && picks.size > 0 && (
        <ul className="sh-question-tally" aria-label="Picks so far" data-noquote="">
          {question.options.map((o) => (
            <li key={o} data-mine={mine?.choice === o || undefined}>
              {o}
              <span className="sh-question-count">{picks.get(o) ?? 0}</span>
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <ul className="sh-question-answers" aria-label="Other answers" data-noquote="">
          {others.map((a) => (
            <li key={a.id} data-hidden={a.hidden || undefined}>
              {(guest || a.author === "guest") && <span className="sh-question-by">{authorName(guest, a)}</span>}
              {a.choice && <span className="sh-question-choice">{a.choice}</span>}
              {a.body && <span>{a.body}</span>}
              <time dateTime={a.updatedAt ?? a.createdAt}>
                {ago(a.updatedAt ?? a.createdAt)}
                {a.updatedAt && a.updatedAt !== a.createdAt && " · changed"}
                {a.hidden && " · hidden from guests"}
              </time>
              {!guest && a.author === "guest" && ctx && (
                <IconButton
                  icon={a.hidden ? "eye" : "eyeOff"}
                  label={a.hidden ? "Show to guests again" : "Hide from guests and the inbox"}
                  size="sm"
                  className="sh-question-hide"
                  onClick={() => void ctx.hideAnswer(a.id, !a.hidden)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
