import {
  forwardRef,
  type InputHTMLAttributes,
  type PointerEvent,
  type TextareaHTMLAttributes,
  useCallback,
  useRef,
} from "react";
import { cx } from "./Button.tsx";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx("sh-field", className)} {...rest} />;
});

/**
 * A text field for longer writing. A pill-shaped grip in the middle of its bottom edge makes it taller or shorter
 * (drag), up to its CSS max-height, and a double-click on the grip puts it back to its first size.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      own.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  const drag = (e: PointerEvent<HTMLSpanElement>) => {
    const field = own.current;
    if (e.button !== 0 || !field) return;
    e.preventDefault();
    const grip = e.currentTarget;
    const startY = e.clientY;
    const startHeight = field.offsetHeight;
    // Never shorter than the field's own minimum (its rows, or the CSS min-height), nor taller than its maximum.
    const style = getComputedStyle(field);
    const least = Number.parseFloat(style.minHeight) || 0;
    const most = Number.parseFloat(style.maxHeight) || Number.POSITIVE_INFINITY;
    grip.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent) => {
      field.style.height = `${Math.min(most, Math.max(least, startHeight + ev.clientY - startY))}px`;
    };
    const stop = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", stop);
      grip.removeEventListener("pointercancel", stop);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", stop);
    grip.addEventListener("pointercancel", stop);
  };

  return (
    <div className="sh-textarea-wrap">
      <textarea ref={setRef} rows={rows} className={cx("sh-field sh-textarea", className)} {...rest} />
      <span
        className="sh-textarea-grip"
        aria-hidden="true"
        title="Drag to resize · double-click for the first size"
        onPointerDown={drag}
        onDoubleClick={() => {
          if (own.current) own.current.style.height = "";
        }}
      />
    </div>
  );
});
