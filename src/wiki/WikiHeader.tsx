// The bar above every wiki page, across the whole window. Left: back to the deck (the owner only) and the project:
// its icon (else its cover), name and tagline, linking home. Middle: search. Right: whether the wiki is live and who is
// on it (ADR-0005), share, the UI primitives (the owner only), and day or night at the far right. The page list and the comments open from here wherever they're drawers: the comments on the
// home page, and both on narrow screens.
import { Link, useNavigate } from "react-router";
import type { Person, WikiDetail } from "../../shared/api.ts";
import { useGuest } from "../guest/GuestContext.ts";
import { picture } from "../lib/base.ts";
import { setViewerMode, useViewerMode } from "../lib/viewerMode.ts";
import { PresenceBar } from "../presence/PresenceBar.tsx";
import { LiveBadge } from "../sharing/LiveBadge.tsx";
import { ShareDialog } from "../sharing/ShareDialog.tsx";
import { Icon, IconButton, Kbd, Tooltip } from "../ui/index.ts";
import { pageHref } from "./PageHead.tsx";
import { PageIcon } from "./PageIcon.tsx";
import { shortcutLabel } from "./SearchPalette.tsx";
import "./header.css";
import { ReadingProgress } from "./ReadingProgress.tsx";

export function WikiHeader({
  wiki,
  wide,
  people,
  onPages,
  onSearch,
  onComments,
}: {
  wiki: WikiDetail;
  /** The home page or a panel page: its rail is a drawer. */
  wide: boolean;
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
    <header className="sh-wiki-head" data-wide={wide || undefined}>
      <div className="sh-head-start">
        <IconButton filled icon="menu" label="Pages" className="sh-head-menu" onClick={onPages} />
        {!guest && (
          // A guest has no deck to go back to (ADR-0003).
          <Tooltip content="Back to the deck" side="bottom">
            <IconButton
              filled
              icon="deck"
              label="Back to the deck"
              onClick={() => navigate("/", { state: { from: wiki.id } })}
            />
          </Tooltip>
        )}
        <Link to={pageHref(wiki.id, "")} className="sh-head-project">
          {wiki.icon ? (
            <span className="sh-head-badge">
              <PageIcon icon={wiki.icon} />
            </span>
          ) : (
            <img src={picture(wiki.coverUrl, 160)} alt="" className="sh-head-cover" />
          )}
          <span className="sh-head-names">
            <span className="sh-head-title">{wiki.title}</span>
            {wiki.tagline && <span className="sh-head-tagline">{wiki.tagline}</span>}
          </span>
        </Link>
      </div>
      <button type="button" className="sh-head-search" onClick={onSearch}>
        <Icon filled name="search" size={15} />
        <span className="sh-head-search-text">Search {wiki.title}</span>
        <Kbd>{shortcutLabel()}</Kbd>
      </button>
      <div className="sh-head-end">
        {guest && (
          <span
            className="sh-guest-badge"
            title={guest.kind === "comment" ? "Shared with you" : "Shared with you to read"}
          >
            <Icon filled name={guest.kind === "comment" ? "comment" : "eye"} size={14} />
            {guest.guest?.name}
          </span>
        )}
        {!guest && <LiveBadge wikiId={wiki.id} title={wiki.title} here={guestsHere} />}
        <PresenceBar wikiId={wiki.id} people={people} />
        {!guest && (
          <ShareDialog
            wikiId={wiki.id}
            title={wiki.title}
            trigger={<IconButton filled icon="share" label="Share this wiki" />}
          />
        )}
        {!guest && (
          <Tooltip content="UI primitives" side="bottom">
            <IconButton
              filled
              icon="primitives"
              label="UI primitives"
              className="sh-head-dev"
              onClick={() => navigate("/dev/ui")}
            />
          </Tooltip>
        )}
        <IconButton filled icon="search" label="Search" className="sh-head-narrow" onClick={onSearch} />
        {onComments && (
          <IconButton filled icon="comment" label="Comments" className="sh-head-rail" onClick={onComments} />
        )}
        <ModeSwitch own={wiki.theme.mode} />
      </div>
      {!wide && <ReadingProgress />}
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
        filled
        icon={mode === "dark" ? "sun" : "moon"}
        label={label}
        onClick={() => setViewerMode(next === own ? null : next)}
      />
    </Tooltip>
  );
}
