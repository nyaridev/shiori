// A question a page asks (ADR-0002): pick an option and/or write a note, and the agent sees it in its inbox. Once
// the agent writes the decision into the page, the card shows it.
import { useState } from "react";
import type { Question } from "../../../shared/api.ts";
import { ago } from "../../lib/time.ts";
import { Badge, Button, Textarea } from "../../ui/index.ts";
import { usePage } from "../PageContext.ts";
import "./questions.css";

export function QuestionCard({ question }: { question: Question }) {
  const ctx = usePage();
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const answers = ctx?.answers.filter((a) => a.question === question.id) ?? [];
  const decided = question.status === "resolved";
  const canSend = !!ctx && (choice !== null || note.trim().length > 0) && state !== "sending";

  const send = async () => {
    if (!ctx || !canSend) return;
    setState("sending");
    try {
      await ctx.answer(question.id, choice, note.trim());
      setChoice(null);
      setNote("");
      setState("sent");
    } catch {
      setState("failed");
    }
  };

  return (
    <section className="sh-question" id={`question-${question.id}`} data-decided={decided || undefined}>
      <header className="sh-question-head">
        <span className="sh-question-kicker">{decided ? "✅ Decided" : "❓ Question"}</span>
        {!decided && answers.length > 0 && (
          <Badge tone="accent">
            {answers.length} answer{answers.length === 1 ? "" : "s"}
          </Badge>
        )}
      </header>
      <p className="sh-question-text">{question.text}</p>

      {decided ? (
        question.answer && <p className="sh-question-answer">{question.answer}</p>
      ) : (
        <div className="sh-question-form">
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
              {state === "sent"
                ? "Sent. The agent sees it in its inbox."
                : state === "failed"
                  ? "Couldn't send. Try again."
                  : "Answers go to the agent's inbox."}
            </span>
            <Button size="sm" variant="solid" disabled={!canSend} onClick={() => void send()}>
              Send answer
            </Button>
          </div>
        </div>
      )}

      {answers.length > 0 && (
        <ul className="sh-question-answers" aria-label="Answers so far">
          {answers.map((a) => (
            <li key={a.id}>
              {a.choice && <span className="sh-question-choice">{a.choice}</span>}
              {a.body && <span>{a.body}</span>}
              <time dateTime={a.createdAt}>{ago(a.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
