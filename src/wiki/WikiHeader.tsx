// The bar above every wiki page. Left: back to the deck (the owner) or what the link allows (a guest). Right: whether
// the wiki is live and who is on it (ADR-0005), share, and day or night at the far right. On narrow screens it also
// holds the buttons for the page list, search and comments, which live in the sidebar and the rail on wide ones.
import { useNavigate } from "react-router";
import type { Person, WikiDetail } from "../../shared/api.ts";
import { useGuest } from "../guest/GuestContext.ts";
import { setViewerMode, useViewerMode } from "../lib/viewerMode.ts";
import { PresenceBar } from "../presence/PresenceBar.tsx";
import { LiveBadge } from "../sharing/LiveBadge.tsx";
import { ShareDialog } from "../sharing/ShareDialog.tsx";
import { Icon, IconButton, Tooltip } from "../ui/index.ts";
import "./header.css";

export function WikiHeader({
  wiki,
  people,
  onPages,
  onSearch,
  onComments,
}: {
  wiki: WikiDetail;
  people: Person[];
  onPages: () => void;
  onSearch: () => void;
  /** Only on a page, which has a rail of comments. */
  onComments?: () => void;
}) {
  const navigate = useNavigate();
  const guest = useGuest();
  const guestsHere = people.filter((p) => p.role === "guest").length;
  return (
    <header className="sh-wiki-head">
      <IconButton icon="menu" label="Pages" className="sh-head-narrow" onClick={onPages} />
      {guest ? (
        // A guest has no deck to go back to (ADR-0003).
        <span className="sh-guest-badge">
          <Icon name="comment" size={14} />
          <span className="sh-head-wide">
            {guest.kind === "comment" ? "Shared with you" : "Shared with you to read"} ·{" "}
          </span>
          {guest.guest?.name}
        </span>
      ) : (
        <Tooltip content="Back to the deck" side="bottom">
          <IconButton
            icon="deck"
            label="Back to the deck"
            onClick={() => navigate("/", { state: { from: wiki.id } })}
          />
        </Tooltip>
      )}
      <span className="sh-head-title sh-head-narrow">{wiki.title}</span>
      <span className="sh-head-space" />
      {!guest && <LiveBadge wikiId={wiki.id} title={wiki.title} here={guestsHere} />}
      <PresenceBar wikiId={wiki.id} people={people} />
      {!guest && (
        <ShareDialog
          wikiId={wiki.id}
          title={wiki.title}
          trigger={<IconButton icon="share" label="Share this wiki" />}
        />
      )}
      <IconButton icon="search" label="Search" className="sh-head-narrow" onClick={onSearch} />
      {onComments && <IconButton icon="comment" label="Comments" className="sh-head-rail" onClick={onComments} />}
      <ModeSwitch own={wiki.theme.mode} />
    </header>
  );
}

/**
 * Day or night for this browser, over every wiki's own mode. Switching back to the wiki's own mode forgets the
 * choice, so each wiki shows as its theme meant again.
 */
function ModeSwitch({ own }: { own: "dark" | "light" }) {
  const picked = useViewerMode();
  const mode = picked ?? own;
  const next = mode === "dark" ? "light" : "dark";
  const label = next === "light" ? "Switch to day" : "Switch to night";
  return (
    <Tooltip content={picked && next === own ? `${label}: this wiki's own look` : label} side="bottom">
      <IconButton
        icon={mode === "dark" ? "sun" : "moon"}
        label={label}
        onClick={() => setViewerMode(next === own ? null : next)}
      />
    </Tooltip>
  );
}
