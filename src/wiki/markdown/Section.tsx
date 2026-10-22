// A `##` section of a plain page as a panel (sections.ts): the heading on a title strip, with what a reader can do
// there: see that it changed since their last visit, give quick feedback, and fold it away. The strip's own text is
// `data-noquote`, so comments keep anchoring to the page's words only.
import { Children, type ReactNode, useId, useRef, useState } from "react";
import { quoteAt } from "../../../shared/quote.ts";
import { offsetsOf, textIndex } from "../../comments/textIndex.ts";
import { canComment, useGuest } from "../../guest/GuestContext.ts";
import { useStored } from "../../lib/stored.ts";
import { Badge, Icon, Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "../../ui/index.ts";
import { usePage } from "../PageContext.ts";

const NONE: Record<string, boolean> = {};

/** Which sections this viewer folded, per wiki, keyed `page#anchor`. */
function useFoldedSection(wikiId: string, id: string): [boolean, () => void] {
  const [folded, setFolded] = useStored(`shiori.sections.${wikiId}`, NONE);
  const isFolded = !!folded[id];
  const toggle = () => {
    const { [id]: _, ...rest } = folded;
    setFolded(isFolded ? rest : { ...rest, [id]: true });
  };
  return [isFolded, toggle];
}

/** Quick feedback on a whole section: it becomes a comment on the section's heading, for the agent. */
const FEEDBACK = [
  { label: "Looks good", icon: "check", body: "Looks good." },
  { label: "Needs work", icon: "comment", body: "Needs work." },
  { label: "Outdated", icon: "warning", body: "This is out of date." },
] as const;

export function SectionEl({
  anchor = "",
  heading = "",
  children,
}: {
  anchor?: string;
  heading?: string;
  children?: ReactNode;
}) {
  const ctx = usePage();
  const writes = canComment(useGuest()) && !ctx?.readOnly;
  const [head, body] = Children.toArray(children);
  const ref = useRef<HTMLElement>(null);
  const bodyId = useId();
  const [folded, toggle] = useFoldedSection(ctx?.wikiId ?? "", `${ctx?.page.path ?? ""}#${anchor}`);
  const [sending, setSending] = useState(false);
  const changed = !!ctx?.changed.has(anchor);

  /** The section's heading as a comment anchor, found the way a selection would be. */
  const send = async (text: string) => {
    const h2 = ref.current?.querySelector("h2");
    const article = ref.current?.closest<HTMLElement>("[data-article]");
    if (!ctx || !h2 || !article) return;
    const index = textIndex(article);
    const range = document.createRange();
    range.selectNodeContents(h2);
    const at = offsetsOf(index, range);
    if (!at) return;
    setSending(true);
    try {
      const t = await ctx.threads.create(quoteAt(index.text, at.start, at.end), text);
      ctx.activate(t.id);
    } finally {
      setSending(false);
    }
  };

  return (
    <section ref={ref} className="sh-section" data-folded={folded || undefined} data-changed={changed || undefined}>
      <div className="sh-section-head">
        {head}
        <div className="sh-section-tools" data-noquote="">
          {changed && (
            <Badge tone="accent" title="This section changed since you last opened the page">
              Changed
            </Badge>
          )}
          {writes && ctx && (
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="sh-section-tool"
                  aria-label={`Feedback on “${heading}”`}
                  title="Feedback on this section"
                  disabled={sending}
                >
                  <Icon name="comment" size={15} />
                </button>
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>Feedback on this section</MenuLabel>
                {FEEDBACK.map((f) => (
                  <MenuItem key={f.label} icon={f.icon} onSelect={() => void send(f.body)}>
                    {f.label}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          )}
          <button
            type="button"
            className="sh-section-tool sh-section-fold-button"
            aria-expanded={!folded}
            aria-controls={bodyId}
            aria-label={`${folded ? "Show" : "Fold"} “${heading}”`}
            title={folded ? "Show this section" : "Fold this section"}
            onClick={toggle}
          >
            <Icon name="chevronDown" size={15} />
          </button>
        </div>
      </div>
      <div className="sh-section-fold" id={bodyId} inert={folded || undefined}>
        <div>{body}</div>
      </div>
    </section>
  );
}
