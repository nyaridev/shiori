// The fields of a page form (ADR-0015): one editor per field type. Each gets its value and says when it changes;
// text waits a moment before it's saved (`delay`), everything else is saved at once.
import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  areasOf,
  type FieldValue,
  type FormEntry,
  type FormField,
  type FormPicture,
  type ListField,
  type SimpleField,
} from "../../../shared/form.ts";
import { gridOf } from "../../../shared/layout.ts";
import { api } from "../../lib/api.ts";
import { PICTURES } from "../../lib/usePictures.tsx";
import { Button, Checkbox, IconButton, Input, Textarea } from "../../ui/index.ts";
import { Zoom } from "../viewer/Zoom.tsx";

/** How long text waits after the last key before it's saved. */
export const TYPING = 700;

export interface FieldProps<F extends FormField = FormField> {
  wikiId: string;
  field: F;
  value: FieldValue;
  /** A new value, saved after `delay` ms. */
  onChange: (value: FieldValue, delay?: number) => void;
  /** Leaving the field: save what's waiting now. */
  onCommit: () => void;
  readOnly: boolean;
}

/** A field's label, its hint, and the editor. */
export function FieldBox({ field, id, children }: { field: FormField; id: string; children: ReactNode }) {
  const hint = field.hint && <p className="sh-form-hint">{field.hint}</p>;
  // Choices, pictures and lists are groups of controls, named by their legend.
  if (field.type === "list" || field.type === "pictures" || field.type === "choice")
    return (
      <fieldset className="sh-form-field" data-type={field.type}>
        <legend className="sh-form-label">{field.label}</legend>
        {hint}
        {children}
      </fieldset>
    );
  return (
    <div className="sh-form-field" data-type={field.type}>
      {/* A checkbox carries its own label. */}
      {field.type !== "check" && (
        <label className="sh-form-label" htmlFor={id}>
          {field.label}
        </label>
      )}
      {hint}
      {children}
    </div>
  );
}

export function FieldInput(props: FieldProps & { id: string }) {
  const { field } = props;
  if (field.type === "list") return <ListInput {...props} field={field} />;
  return <SimpleInput {...props} field={field} />;
}

function SimpleInput({
  wikiId,
  field,
  value,
  onChange,
  onCommit,
  readOnly,
  id,
}: FieldProps<SimpleField> & { id: string }) {
  switch (field.type) {
    case "line":
      return (
        <Input
          id={id}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          maxLength={300}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value, TYPING)}
          onBlur={onCommit}
        />
      );
    case "text":
      return (
        <Textarea
          id={id}
          rows={field.rows}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          maxLength={20_000}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value, TYPING)}
          onBlur={onCommit}
        />
      );
    case "number":
      return (
        <NumberInput id={id} field={field} value={value} onChange={onChange} onCommit={onCommit} readOnly={readOnly} />
      );
    case "choice":
      return <Choice field={field} value={value} onChange={onChange} readOnly={readOnly} />;
    case "check":
      return readOnly ? (
        <p className="sh-form-readonly">
          {field.label}: {value === true ? "yes" : "no"}
        </p>
      ) : (
        <Checkbox checked={value === true} onChange={(v) => onChange(v)}>
          {field.label}
        </Checkbox>
      );
    case "pictures":
      return (
        <PicturesInput
          wikiId={wikiId}
          field={field}
          value={value}
          onChange={onChange}
          onCommit={onCommit}
          readOnly={readOnly}
        />
      );
  }
}

/** Typed as text, so "1." or "-" can be on the way to a number; saved as a number, or null when empty. */
function NumberInput({
  id,
  field,
  value,
  onChange,
  onCommit,
  readOnly,
}: Omit<FieldProps<Extract<SimpleField, { type: "number" }>>, "wikiId"> & { id: string }) {
  const shown = typeof value === "number" ? String(value) : "";
  const [text, setText] = useState(shown);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(shown);
  }, [shown]);
  return (
    <span className="sh-form-number">
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        placeholder={field.placeholder}
        readOnly={readOnly}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          setText(e.target.value);
          const raw = e.target.value.trim().replace(",", ".");
          const n = Number(raw);
          if (!raw) onChange(null, TYPING);
          else if (Number.isFinite(n)) onChange(n, TYPING);
        }}
        onBlur={() => {
          focused.current = false;
          setText(shown);
          onCommit();
        }}
      />
      {field.unit && <span className="sh-form-unit">{field.unit}</span>}
    </span>
  );
}

/** Options as chips: one to pick (a second click takes it back), or several with `multiple`. */
function Choice({
  field,
  value,
  onChange,
  readOnly,
}: Pick<FieldProps<Extract<SimpleField, { type: "choice" }>>, "field" | "value" | "onChange" | "readOnly">) {
  const picked = Array.isArray(value) ? (value as string[]) : typeof value === "string" ? [value] : [];
  // What's picked now, so two quick clicks both count.
  const latest = useRef(picked);
  latest.current = picked;
  const toggle = (option: string) => {
    const now = latest.current;
    const toggled = now.includes(option) ? now.filter((o) => o !== option) : [...now, option];
    // Kept in the form's order.
    const next = field.multiple
      ? field.options.filter((o) => toggled.includes(o))
      : toggled.filter((o) => o === option);
    latest.current = next;
    onChange(field.multiple ? next : (next[0] ?? null));
  };
  return (
    <div className="sh-form-chips">
      {field.options.map((option) => (
        <button
          key={option}
          type="button"
          className="sh-form-chip"
          aria-pressed={picked.includes(option)}
          disabled={readOnly}
          onClick={() => toggle(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

const isPicture = (p: unknown): p is FormPicture =>
  !!p && typeof p === "object" && typeof (p as FormPicture).file === "string";

/** Pictures with captions: added with the button, or dropped or pasted on the field. */
function PicturesInput({
  wikiId,
  field,
  value,
  onChange,
  onCommit,
  readOnly,
}: FieldProps<Extract<SimpleField, { type: "pictures" }>>) {
  const list = Array.isArray(value) ? value.filter(isPicture) : [];
  const input = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  // The list as it is after each upload, so pictures added together all stay.
  const current = useRef(list);
  current.current = list;

  const add = async (files: Iterable<Blob>) => {
    const chosen = [...files].filter((f) => PICTURES.types.includes(f.type));
    const room = field.max - current.current.length;
    if (!chosen.length) return setProblem("Add a PNG, JPEG, WebP or GIF picture.");
    if (room <= 0) return setProblem(`This field takes at most ${field.max} pictures.`);
    setProblem(chosen.length > room ? `Only ${room} more fit here.` : null);
    for (const blob of chosen.slice(0, room)) {
      if (blob.size > PICTURES.bytes) {
        setProblem("That picture is too big (at most 6 MB).");
        continue;
      }
      setAdding((n) => n + 1);
      try {
        const { file } = await api.attach(wikiId, blob);
        const next = [...current.current, { file, caption: "" }];
        current.current = next;
        onChange(next);
      } catch (e) {
        setProblem((e as { detail?: string }).detail ?? "Couldn't add that picture.");
      } finally {
        setAdding((n) => n - 1);
      }
    }
  };
  const caption = (file: string, text: string) =>
    onChange(
      list.map((p) => (p.file === file ? { ...p, caption: text } : p)),
      TYPING,
    );
  const remove = (file: string) => onChange(list.filter((p) => p.file !== file));

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dropping and pasting add to the "Add pictures" button, which is the way in by keyboard.
    <div
      className="sh-form-pictures"
      onDragOver={(e) => !readOnly && e.preventDefault()}
      onDrop={(e) => {
        if (readOnly) return;
        e.preventDefault();
        void add(e.dataTransfer.files);
      }}
      onPaste={(e) => {
        const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
        if (readOnly || !files.length) return;
        e.preventDefault();
        void add(files);
      }}
    >
      {list.length > 0 && (
        <ul>
          {list.map((p) => (
            <li key={p.file}>
              <Zoom src={api.attachmentUrl(wikiId, p.file)} label={p.caption || field.label}>
                <img src={api.attachmentUrl(wikiId, p.file, 480)} alt={p.caption} loading="lazy" />
              </Zoom>
              {readOnly ? (
                p.caption && <span className="sh-form-caption">{p.caption}</span>
              ) : (
                <>
                  <Input
                    value={p.caption}
                    maxLength={200}
                    placeholder="Caption"
                    aria-label="Caption"
                    onChange={(e) => caption(p.file, e.target.value)}
                    onBlur={onCommit}
                  />
                  <IconButton icon="close" label="Remove this picture" size="sm" onClick={() => remove(p.file)} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="sh-form-add">
          <Button
            size="sm"
            variant="soft"
            icon="plus"
            disabled={list.length >= field.max || adding > 0}
            onClick={() => input.current?.click()}
          >
            {adding ? `Adding ${adding === 1 ? "a picture" : `${adding} pictures`}…` : "Add pictures"}
          </Button>
          <span className="sh-form-hint">Or drop or paste them here.</span>
          <input
            ref={input}
            type="file"
            accept={PICTURES.types.join(",")}
            multiple
            hidden
            onChange={(e) => {
              void add(e.target.files ?? []);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {problem && <p className="sh-form-problem">{problem}</p>}
    </div>
  );
}

const newId = () => Math.random().toString(36).slice(2, 12);
const isEntry = (e: unknown): e is FormEntry =>
  !!e &&
  typeof e === "object" &&
  typeof (e as FormEntry).id === "string" &&
  typeof (e as FormEntry).values === "object";

/** Entries that repeat (abilities, quests): each a card with the list's fields, moved up and down or removed. */
function ListInput({ wikiId, field, value, onChange, onCommit, readOnly }: FieldProps<ListField>) {
  const entries = Array.isArray(value) ? value.filter(isEntry) : [];
  const grid = gridOf({ areas: areasOf(field), blocks: field.fields });
  const style = { "--form-areas": grid.areas, "--form-columns": grid.columns } as CSSProperties;
  const item = field.item ?? "Entry";
  const set = (next: FormEntry[], delay = 0) => onChange(next, delay);
  const move = (i: number, by: number) => {
    const next = [...entries];
    const [entry] = next.splice(i, 1);
    next.splice(i + by, 0, entry);
    set(next);
  };
  // An entry's name: its first one-line field, when it has one.
  const nameField = Object.entries(field.fields).find(([, f]) => f.type === "line")?.[0];

  return (
    <div className="sh-form-list">
      {entries.map((entry, i) => {
        const name =
          nameField && typeof entry.values[nameField] === "string" ? (entry.values[nameField] as string) : "";
        return (
          <section key={entry.id} className="sh-form-entry" aria-label={name || `${item} ${i + 1}`}>
            <header>
              <span className="sh-form-entry-name">{name.trim() || `${item} ${i + 1}`}</span>
              {!readOnly && (
                <span className="sh-form-entry-tools">
                  <IconButton
                    icon="chevronUp"
                    label="Move up"
                    size="sm"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  />
                  <IconButton
                    icon="chevronDown"
                    label="Move down"
                    size="sm"
                    disabled={i === entries.length - 1}
                    onClick={() => move(i, 1)}
                  />
                  <IconButton
                    icon="trash"
                    label={`Remove this ${item.toLowerCase()}`}
                    size="sm"
                    onClick={() => set(entries.filter((e) => e.id !== entry.id))}
                  />
                </span>
              )}
            </header>
            <div className="sh-form-grid" style={style}>
              {areasInOrder(field).map((sub) => (
                <SubField
                  key={sub}
                  wikiId={wikiId}
                  field={field.fields[sub]}
                  area={sub}
                  value={entry.values[sub] ?? null}
                  readOnly={readOnly}
                  onCommit={onCommit}
                  onChange={(v, delay) =>
                    set(
                      entries.map((e) => (e.id === entry.id ? { ...e, values: { ...e.values, [sub]: v } } : e)),
                      delay,
                    )
                  }
                />
              ))}
            </div>
          </section>
        );
      })}
      {!readOnly && (
        <Button
          size="sm"
          variant="soft"
          icon="plus"
          className="sh-form-add-entry"
          disabled={entries.length >= 100}
          onClick={() => set([...entries, { id: newId(), values: {} }])}
        >
          Add {item.toLowerCase()}
        </Button>
      )}
      {readOnly && !entries.length && <p className="sh-form-readonly">—</p>}
    </div>
  );
}

function SubField({ area, ...props }: Omit<FieldProps<SimpleField>, "field"> & { field: SimpleField; area: string }) {
  const id = useId();
  return (
    <div className="sh-form-area" style={{ gridArea: area }}>
      <FieldBox field={props.field} id={id}>
        <SimpleInput {...props} id={id} />
      </FieldBox>
    </div>
  );
}

/** A grid's fields in reading order: by where each first appears in its rows. */
export const areasInOrder = (f: { areas?: string[][]; fields: Record<string, unknown> }) => [
  ...new Set(areasOf(f).flat()),
];
