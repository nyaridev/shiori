// The owner's at-a-glance sharing state (ADR-0003, ADR-0005): "Live · 2 guests" while a link to this wiki is open
// to the internet, "Starting…" while the tunnel comes up, "This PC only" when it can't. Nothing when the wiki isn't
// shared. A click opens the Share dialog.
import type { SharesState } from "../../shared/api.ts";
import { ShareDialog } from "./ShareDialog.tsx";
import { useShares } from "./useShares.ts";

type Look = { tone: "live" | "wait" | "off"; text: string; hint: string };

function look(state: SharesState, wikiId: string, here: number): Look | null {
  const links = state.shares.filter((s) => s.wiki === wikiId);
  if (!links.length) return null;
  const n = `${links.length} link${links.length === 1 ? "" : "s"}`;
  switch (state.tunnel.state) {
    case "up":
      return {
        tone: "live",
        text: here ? `Live · ${here} guest${here === 1 ? "" : "s"}` : "Live",
        hint: `Open to anyone with the link (${n}). ${here ? `${here} here now.` : "Nobody here yet."}`,
      };
    case "starting":
      return { tone: "wait", text: "Starting…", hint: `Getting a public address for ${n}.` };
    default:
      return {
        tone: "off",
        text: "This PC only",
        hint: state.tunnel.error ?? "The tunnel isn't up, so links work on this PC only. Open Share to see why.",
      };
  }
}

/** `here`: guests on this wiki right now (presence). */
export function LiveBadge({ wikiId, title, here }: { wikiId: string; title: string; here: number }) {
  const { state } = useShares();
  const shown = state && look(state, wikiId, here);
  if (!shown) return null;
  return (
    <ShareDialog
      wikiId={wikiId}
      title={title}
      trigger={
        <button type="button" className="sh-live" data-tone={shown.tone} title={shown.hint}>
          <span className="sh-live-dot" aria-hidden="true" />
          {shown.text}
        </button>
      }
    />
  );
}
