// A tester's new report (ADR-0010): a kind, a title, details, and pictures or GIFs (pasted or picked).
import { useState } from "react";
import { REPORT_KINDS, REPORT_LIMITS, type ReportKind } from "../../shared/api.ts";
import { AddPictures, PickedPictures, usePictures } from "../lib/usePictures.tsx";
import { Button, Input, Textarea } from "../ui/index.ts";
import { type NewReport, testerApi } from "./api.ts";
import { KIND } from "./labels.ts";
import { KindMark } from "./ReportCard.tsx";

export function ReportForm({ onSent }: { onSent: () => void }) {
  const [kind, setKind] = useState<ReportKind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const { pictures, add, remove, clear, onPaste, problem, setProblem, full } = usePictures();

  const send = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      const images = [];
      for (const p of pictures) images.push((await testerApi.attach(p.blob)).file);
      const report: NewReport = { kind, title: title.trim(), body: body.trim(), images };
      await testerApi.create(report);
      clear();
      setTitle("");
      setBody("");
      onSent();
    } catch (e) {
      setProblem(e instanceof Error ? `Couldn't send: ${e.message}` : "Couldn't send. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="sh-report-form" aria-label="New report">
      <fieldset className="sh-kind-pick">
        <legend className="sh-sr-only">What is it?</legend>
        {REPORT_KINDS.map((k) => (
          <label key={k} className="sh-kind-option" data-kind={k}>
            <input
              type="radio"
              name="sh-report-kind"
              value={k}
              className="sh-sr-only"
              checked={kind === k}
              onChange={() => setKind(k)}
            />
            <KindMark kind={k} size="lg" />
            <span className="sh-kind-option-text">
              <strong>{KIND[k].label}</strong>
              <span>{KIND[k].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Input
        value={title}
        maxLength={REPORT_LIMITS.title}
        placeholder={kind === "bug" ? "In a few words: what went wrong?" : "In a few words"}
        aria-label="Title"
        onChange={(e) => setTitle(e.target.value)}
      />
      <Textarea
        rows={4}
        value={body}
        placeholder={`${KIND[kind].ask} Paste or add screenshots and GIFs if they help.`}
        aria-label="Details"
        onChange={(e) => setBody(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
        }}
      />
      <PickedPictures pictures={pictures} onRemove={remove} />
      <div className="sh-discussion-actions">
        <AddPictures onAdd={add} disabled={full} />
        {problem && <span className="sh-discussion-problem">{problem}</span>}
        <Button variant="solid" icon="send" disabled={!title.trim() || saving} onClick={() => void send()}>
          Send {KIND[kind].label.toLowerCase()}
        </Button>
      </div>
    </section>
  );
}
