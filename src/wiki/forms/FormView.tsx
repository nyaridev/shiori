// One of a page's forms (ADR-0015), in place of the page under its tabs: the form's fields in its grid, saving as you
// go. Only the owner sees it. A form that isn't on the page any more (or whose file is broken) still shows what was
// written, read-only, so nothing is lost.
import { type CSSProperties, useId } from "react";
import { areasOf, type FieldValue, type FormField, type PageForm, picturesIn } from "../../../shared/form.ts";
import { gridOf } from "../../../shared/layout.ts";
import { api } from "../../lib/api.ts";
import { ago } from "../../lib/time.ts";
import { Callout, Icon } from "../../ui/index.ts";
import { areasInOrder, FieldBox, FieldInput } from "./fields.tsx";
import { type SaveState, useFormEditor } from "./useForms.ts";
import "./forms.css";

function Status({ state, form }: { state: SaveState; form: PageForm }) {
  const read = form.readAt && (!form.updatedAt || form.readAt >= form.updatedAt);
  return (
    <p className="sh-form-status" aria-live="polite">
      <span>
        <Icon name="lock" size={12} /> Only you see this
      </span>
      <span data-tone={state.error ? "bad" : undefined}>
        {state.error
          ? `Couldn't save: ${state.error}`
          : state.saving
            ? "Saving…"
            : state.savedAt
              ? "Saved"
              : "Saves as you go"}
      </span>
      {form.updatedAt && (
        <span
          title={read ? `The agent read it ${ago(form.readAt as string)}` : "The agent hasn't read the latest changes"}
        >
          {read ? "Read by the agent" : "New for the agent"}
        </span>
      )}
    </p>
  );
}

function Field({
  wikiId,
  field,
  area,
  value,
  onChange,
  onCommit,
  readOnly,
}: {
  wikiId: string;
  field: FormField;
  area: string;
  value: FieldValue;
  onChange: (v: FieldValue, delay?: number) => void;
  onCommit: () => void;
  readOnly: boolean;
}) {
  const id = useId();
  return (
    <div className="sh-form-area" style={{ gridArea: area }}>
      <FieldBox field={field} id={id}>
        <FieldInput
          id={id}
          wikiId={wikiId}
          field={field}
          value={value}
          onChange={onChange}
          onCommit={onCommit}
          readOnly={readOnly}
        />
      </FieldBox>
    </div>
  );
}

/** Values whose field isn't in the form any more: shown as they were, to copy from. */
function Leftovers({ wikiId, form }: { wikiId: string; form: PageForm }) {
  const left = form.values.filter((v) => !form.form || !Object.hasOwn(form.form.fields, v.field));
  if (!left.length) return null;
  return (
    <section className="sh-form-leftovers">
      <h2 className="sh-rail-title">No longer in the form</h2>
      <p className="sh-form-hint">Kept so nothing is lost. The agent can still read them.</p>
      {left.map((v) => {
        const pictures = picturesIn(v.value);
        return (
          <div key={v.field} className="sh-form-field">
            <span className="sh-form-label">{v.field}</span>
            {typeof v.value === "string" ? (
              <p className="sh-form-text">{v.value}</p>
            ) : pictures.length ? (
              <ul className="sh-form-thumbs">
                {pictures.map((p) => (
                  <li key={p.file}>
                    <img src={api.attachmentUrl(wikiId, p.file, 160)} alt={p.caption} />
                  </li>
                ))}
              </ul>
            ) : (
              <pre className="sh-form-text">{JSON.stringify(v.value, null, 2)}</pre>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function FormView({ wikiId, path, form }: { wikiId: string; path: string; form: PageForm }) {
  const editor = useFormEditor(wikiId, path, form);
  const def = form.form;
  const readOnly = !form.applies;
  const grid = def ? gridOf({ areas: areasOf(def), blocks: def.fields }) : null;
  const style = grid ? ({ "--form-areas": grid.areas, "--form-columns": grid.columns } as CSSProperties) : undefined;

  return (
    <section className="sh-form" aria-label={def?.title ?? form.name}>
      <div className="sh-form-head">
        {def?.description && <p className="sh-form-description">{def.description}</p>}
        <Status state={editor.state} form={form} />
      </div>
      {form.problems && (
        <Callout tone="warning" title={`forms/${form.name}.json has problems (for the agent: pnpm shiori check)`}>
          <ul>
            {form.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Callout>
      )}
      {def && readOnly && (
        <Callout tone="note" title="This form isn't on this page any more">
          What was written stays, to read. The agent can move it or put the form back on the page.
        </Callout>
      )}
      {def && grid && (
        <div className="sh-form-grid" style={style}>
          {areasInOrder(def).map((id) => (
            <Field
              key={id}
              wikiId={wikiId}
              area={id}
              field={def.fields[id]}
              value={editor.value(id)}
              onChange={(v, delay) => editor.change(id, v, delay)}
              onCommit={() => editor.commit(id)}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
      <Leftovers wikiId={wikiId} form={form} />
    </section>
  );
}
