// Where the wiki is kept (ADR-0008), on the home page's bar: its repo online (a click opens the wiki's folder there),
// a repo with no remote, or not in git at all. The owner only; guests never learn where the repo is.
import type { GitInfo } from "../../../shared/api.ts";
import { api } from "../../lib/api.ts";
import { useLive } from "../../lib/live.ts";
import { useResource } from "../../lib/useResource.ts";
import { Icon, Tooltip } from "../../ui/index.ts";
import { PageIcon } from "../PageIcon.tsx";

function label(git: GitInfo) {
  if (!git.repo)
    return { text: "Not in git", hint: "This wiki's folder isn't in a git repo, so pages have no history." };
  const where = git.folder ? ` (in ${git.folder}/)` : "";
  const changes = git.changes
    ? ` ${git.changes} file${git.changes === 1 ? "" : "s"} changed since the last commit.`
    : " Everything is committed.";
  if (!git.remote)
    return {
      text: git.branch ? `Git · ${git.branch}` : "Git",
      hint: `In a git repo with no remote${where}.${changes}`,
    };
  return {
    text: git.remote.name,
    hint: `Opens the wiki on ${git.remote.host}${where}${git.branch ? `, branch ${git.branch}` : ""}.${changes}`,
  };
}

export function GitBadge({ wikiId }: { wikiId: string }) {
  const git = useResource(`git:${wikiId}`, () => api.git(wikiId));
  const { reload } = git;
  useLive((e) => {
    if ((e.type === "git" || e.type === "pages") && e.wiki === wikiId) reload();
  });
  if (!git.data) return null;
  const { text, hint } = label(git.data);
  const inner = (
    <>
      <PageIcon icon="branch" />
      <span className="sh-git-name">{text}</span>
      {!!git.data.changes && (
        <span className="sh-git-changes" title={`${git.data.changes} not committed`}>
          {git.data.changes}
        </span>
      )}
      {git.data.remote && <Icon name="arrowRight" size={13} />}
    </>
  );
  return (
    <Tooltip content={hint}>
      {git.data.remote ? (
        <a className="sh-git-badge" href={git.data.remote.folderUrl} target="_blank" rel="noreferrer noopener">
          {inner}
        </a>
      ) : (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the tooltip says what it means, so it's reachable by keyboard.
        <span className="sh-git-badge" data-off={!git.data.repo || undefined} tabIndex={0}>
          {inner}
        </span>
      )}
    </Tooltip>
  );
}
