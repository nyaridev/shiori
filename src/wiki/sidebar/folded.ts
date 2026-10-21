// Which sidebar sections this viewer folded, per wiki, remembered in the browser. A section the viewer never touched
// follows its default (long ones start folded).
import { useCallback } from "react";
import { useStored } from "../../lib/stored.ts";

const NONE: Record<string, boolean> = {};

/** Whether section `key` is folded, and a toggle. */
export function useFolded(wikiId: string, key: string, byDefault: boolean): [boolean, () => void] {
  const [choices, setChoices] = useStored(`shiori.folded.${wikiId}`, NONE);
  const folded = choices[key] ?? byDefault;
  const toggle = useCallback(() => setChoices({ ...choices, [key]: !folded }), [choices, key, folded, setChoices]);
  return [folded, toggle];
}
