// A question a page asks (ADR-0002), or a suggestion the agent made for it: the same card, amber for a question about
// what's there and green for an idea to add or improve. Pick an option (or any number of them on a `multiple` one)
// and/or write a note, and the agent sees it in its inbox. Each
// person has one answer, which they can change while the question is open; the card says whether it's still waiting
// for the agent. Options show how many people picked them. Once the agent writes the decision into the page, the
// card shows it. Everything but the question and the decision is `data-noquote`: answers and counts change, and
// comments anchor to the page's own words.
import { type ReactNode, useId, useState } from "react";
import { type Answer, type AnswerPick, picksOf, type Question } from "../../../shared/api.ts";
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

/** A question on its page: its answers and how to send one come from the page. */
export function QuestionCard({ question }: { question: Question }) {
  const ctx = usePage();
  return (
    <QuestionCardView
      question={question}
      answers={ctx?.answers.filter((a) => a.question === question.id) ?? []}
      onAnswer={ctx ? (pick, body) => ctx.answer(question.id, pick, body) : undefined}
      onHide={ctx?.hideAnswer}
      readOnly={ctx?.readOnly}
    />
  );
}

interface ViewProps {
  question: Question;
  answers: Answer[];
  /** Sends the viewer's answer; none where there's nowhere to send it. */
  onAnswer?: (pick: AnswerPick, body: string) => Promise<unknown>;
  /** The owner hides a guest's answer, or shows it again. */
  onHide?: (id: number, hidden: boolean) => Promise<unknown>;
  readOnly?: boolean;
  /** A line above the question: where it's from, on a list of questions from many pages. */
  from?: ReactNode;
  /** After an answer was sent. */
  onSent?: () => void;
  /** Starts with the form open on the viewer's answer (changing it from a list). */
  startEditing?: boolean;
  /** Left editing without sending. */
  onCancel?: () => void;
}

/** The card itself, for any list: the page's, or the wiki-wide one (Special:Questions). */
export function QuestionCardView({
  question,
  answers,
  onAnswer,
  onHide,
  readOnly,
  from,
  onSent,
  startEditing,
  onCancel,
}: ViewProps) {
  const guest = useGuest();
  const mine: Answer | undefined = answers.find((a) => (guest ? a.mine : a.author === "user"));
  // A `multiple` question takes any number of its options; any other, one.
  const multiple = !!question.multiple && question.options.length > 0;
  const minePicks = (a = mine) => (a ? picksOf(a).slice(0, multiple ? undefined : 1) : []);
  const [editing, setEditing] = useState(!!startEditing && !!mine);
  const [picked, setPicked] = useState<string[]>(startEditing ? minePicks() : []);
  const [note, setNote] = useState(startEditing ? (mine?.body ?? "") : "");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const decided = question.status === "resolved";
  const canSend = !!onAnswer && (picked.length > 0 || note.trim().length > 0) && state !== "sending";
  const writes = canComment(guest) && !readOnly;
  const textId = useId();
  const showForm = !decided && writes && (!mine || editing);
  // How many people picked each option (what the owner hid doesn't count).
  // Everyone else's answers; yours shows above, with its state.
  const others = answers.filter((a) => a !== mine);
  const picks = new Map<string, number>();
  for (const a of answers) if (!a.hidden) for (const o of picksOf(a)) picks.set(o, (picks.get(o) ?? 0) + 1);
  const mineSet = new Set(mine ? picksOf(mine) : []);

  const toggle = (o: string) =>
    setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : multiple ? [...p, o] : [o]));

  const change = () => {
    setPicked(minePicks());
    setNote(mine?.body ?? "");
    setEditing(true);
  };

  const send = async () => {
    if (!onAnswer || !canSend) return;
    setState("sending");
    try {
      // A multiple one sends its picks as a list, in the page's order.
      const pick = multiple ? question.options.filter((o) => picked.includes(o)) : (picked[0] ?? null);
      await onAnswer(pick, note.trim());
      setPicked([]);
      setNote("");
      setEditing(false);
      setState("sent");
      onSent?.();
    } catch {
      setState("failed");
    }
  };

  return (
    <section
      className="sh-question"
      id={from ? undefined : `question-${question.id}`}
      data-kind={question.kind}
      data-decided={decided || undefined}
      aria-labelledby={textId}
    >
      {from && (
        <div className="sh-question-from" data-noquote="">
          {from}
        </div>
      )}
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
          {!decided && multiple && !showForm && <Badge title="People can pick more than one option">Pick any</Badge>}
          {!decided && answers.length > 0 && (
            <Badge tone="accent">
              {answers.length} answer{answers.length === 1 ? "" : "s"}
            </Badge>
          )}
        </span>
      </header>
      <p className="sh-question-text" id={textId}>
        {question.text}
      </p>

      {decided && question.answer && <p className="sh-question-answer">{question.answer}</p>}

      {/* Your answer, and where it stands. */}
      {mine && !showForm && (
        <div className="sh-question-mine" data-noquote="">
          <span className="sh-question-mine-text">
            <span className="sh-question-by">Your answer</span>
            <Picks answer={mine} />
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
            <fieldset className="sh-question-options" data-multiple={multiple || undefined}>
              {/* The markers show it on screen: round for one, square for any. */}
              <legend className="sh-sr-only">{multiple ? "Pick any" : "Pick one"}</legend>
              {question.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  className="sh-question-option"
                  aria-pressed={picked.includes(o)}
                  onClick={() => toggle(o)}
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
            {state === "failed" && <span className="sh-question-hint">Couldn't send. Try again.</span>}
            <span className="sh-question-buttons">
              {editing && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    onCancel?.();
                  }}
                >
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
            <li key={o} data-mine={mineSet.has(o) || undefined}>
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
              <Picks answer={a} />
              {a.body && <span>{a.body}</span>}
              <time dateTime={a.updatedAt ?? a.createdAt}>
                {ago(a.updatedAt ?? a.createdAt)}
                {a.updatedAt && a.updatedAt !== a.createdAt && " · changed"}
                {a.hidden && " · hidden from guests"}
              </time>
              {!guest && a.author === "guest" && onHide && (
                <IconButton
                  icon={a.hidden ? "eye" : "eyeOff"}
                  label={a.hidden ? "Show to guests again" : "Hide from guests and the inbox"}
                  size="sm"
                  className="sh-question-hide"
                  onClick={() => void onHide(a.id, !a.hidden)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The options an answer picked, one chip each. */
export function Picks({ answer }: { answer: Answer }) {
  return picksOf(answer).map((o) => (
    <span key={o} className="sh-question-choice">
      {o}
    </span>
  ));
}
