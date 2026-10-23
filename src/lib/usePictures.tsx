// Pictures picked to go with something not sent yet: a change request (ADR-0007) or a tester's report (ADR-0010).
// Local previews until they're sent; pasted screenshots join too. The server checks the same limits again.
import { type ClipboardEvent, useEffect, useRef, useState } from "react";
import { Button, IconButton } from "../ui/index.ts";

/** What a change or a report may carry, as the server allows (server/attachments.ts). */
export const PICTURES = {
  max: 4,
  bytes: 6 * 1024 * 1024,
  types: ["image/png", "image/jpeg", "image/webp", "image/gif"],
};

export interface Picked {
  blob: Blob;
  /** A local preview until it's sent. */
  url: string;
}

export function usePictures() {
  const [pictures, setPictures] = useState<Picked[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  // Previews are local object URLs; let them go when they're dropped or the form goes away.
  const previews = useRef(pictures);
  previews.current = pictures;
  useEffect(
    () => () => {
      for (const p of previews.current) URL.revokeObjectURL(p.url);
    },
    [],
  );

  const add = (files: Iterable<Blob>) => {
    const next: Picked[] = [];
    for (const blob of files) {
      if (!PICTURES.types.includes(blob.type)) {
        setProblem("Add a PNG, JPEG, WebP or GIF picture.");
        continue;
      }
      if (blob.size > PICTURES.bytes) {
        setProblem("That picture is too big (at most 6 MB).");
        continue;
      }
      next.push({ blob, url: URL.createObjectURL(blob) });
    }
    setPictures((list) => {
      const all = [...list, ...next];
      if (all.length > PICTURES.max) setProblem(`At most ${PICTURES.max} pictures.`);
      for (const p of all.slice(PICTURES.max)) URL.revokeObjectURL(p.url);
      return all.slice(0, PICTURES.max);
    });
  };

  const remove = (url: string) => {
    URL.revokeObjectURL(url);
    setPictures((list) => list.filter((p) => p.url !== url));
  };

  /** After sending: the previews go. */
  const clear = () => {
    for (const p of pictures) URL.revokeObjectURL(p.url);
    setPictures([]);
  };

  // A screenshot pasted into the text joins the pictures.
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    add(files);
  };

  return { pictures, add, remove, clear, onPaste, problem, setProblem, full: pictures.length >= PICTURES.max };
}

/** The pictures waiting to go, each with a button that drops it. */
export function PickedPictures({ pictures, onRemove }: { pictures: Picked[]; onRemove: (url: string) => void }) {
  if (!pictures.length) return null;
  return (
    <ul className="sh-change-pictures" aria-label="Pictures to send">
      {pictures.map((p) => (
        <li key={p.url}>
          <img src={p.url} alt="" />
          <IconButton icon="close" label="Remove this picture" size="sm" onClick={() => onRemove(p.url)} />
        </li>
      ))}
    </ul>
  );
}

/** A hidden file input and the button that opens it. */
export function AddPictures({ onAdd, disabled }: { onAdd: (files: Iterable<Blob>) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={PICTURES.types.join(",")}
        multiple
        hidden
        onChange={(e) => {
          onAdd(e.target.files ?? []);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="ghost" icon="plus" disabled={disabled} onClick={() => input.current?.click()}>
        Add picture
      </Button>
    </>
  );
}
