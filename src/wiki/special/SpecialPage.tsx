// Special pages (ADR-0002): wiki-wide lists under /w/<wiki>/_/, like Wikipedia's "Special:" pages. Page files can't
// start with `_`, so these never clash with a page. They read the wiki's page index, so they're always in step with
// the files.
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import type { PageEntry, QuestionEntry, TaskEntry, WantedPage, WikiDetail, WikiIndex } from "../../../shared/api.ts";
import { Icon, Segmented } from "../../ui/index.ts";
import { PageCard, PageChip } from "../PageFoot.tsx";
import { Crumbs, pageHref, specialHref } from "../PageHead.tsx";
import { StatusBadge } from "../StatusBadge.tsx";
import { SPECIALS } from "./specials.ts";
import { Elements, Fields, Kits, Specials } from "./Toolbox.tsx";
import "./special.css";

function dayOf(iso: string): string {
  const day = new Date(iso);
  const today = new Date();
  const diff = Math.round(
    (new Date(today.toDateString()).getTime() - new Date(day.toDateString()).getTime()) / 86_400_000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function Row({ wikiId, page, lead }: { wikiId: string; page: PageEntry; lead?: ReactNode }) {
  return (
    <li className="sh-special-row">
      {lead}
      <Link to={pageHref(wikiId, page.path)} className="sh-special-link">
        <span aria-hidden="true">{page.icon ?? "📄"}</span>
        {page.title}
      </Link>
      {page.type && <span className="sh-page-type">{page.type}</span>}
      {page.status && <StatusBadge status={page.status} />}
      {page.summary && <span className="sh-special-summary">{page.summary}</span>}
    </li>
  );
}

function Recent({ wikiId, pages }: { wikiId: string; pages: PageEntry[] }) {
  const days = new Map<string, PageEntry[]>();
  for (const p of [...pages].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))) {
    const day = p.updatedAt ? dayOf(p.updatedAt) : "Unknown";
    days.set(day, [...(days.get(day) ?? []), p]);
  }
  return (
    <>
      {[...days].map(([day, list]) => (
        <section key={day} className="sh-special-group">
          <h2 className="sh-special-heading">{day}</h2>
          <ul className="sh-special-list">
            {list.map((p) => (
              <Row
                key={p.path}
                wikiId={wikiId}
                page={p}
                lead={
                  p.updatedAt && (
                    <time className="sh-special-time" dateTime={p.updatedAt}>
                      {new Date(p.updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  )
                }
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function AllPages({ wikiId, pages }: { wikiId: string; pages: PageEntry[] }) {
  const letters = new Map<string, PageEntry[]>();
  for (const p of [...pages].sort((a, b) => a.title.localeCompare(b.title))) {
    const first = p.title.normalize("NFD")[0]?.toUpperCase() ?? "#";
    const letter = /\p{L}/u.test(first) ? first : "#";
    letters.set(letter, [...(letters.get(letter) ?? []), p]);
  }
  return (
    <>
      <nav className="sh-special-letters" aria-label="Jump to letter">
        {[...letters.keys()].map((l) => (
          <a key={l} href={`#letter-${l}`}>
            {l}
          </a>
        ))}
      </nav>
      {[...letters].map(([letter, list]) => (
        <section key={letter} className="sh-special-group">
          <h2 className="sh-special-heading" id={`letter-${letter}`}>
            {letter}
          </h2>
          <ul className="sh-special-list">
            {list.map((p) => (
              <Row key={p.path} wikiId={wikiId} page={p} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function tagsOf(pages: PageEntry[]): [string, PageEntry[]][] {
  const tags = new Map<string, PageEntry[]>();
  for (const p of pages) for (const t of p.tags) tags.set(t, [...(tags.get(t) ?? []), p]);
  return [...tags].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function Categories({ wikiId, pages }: { wikiId: string; pages: PageEntry[] }) {
  const tags = tagsOf(pages);
  if (!tags.length) return <p className="sh-special-empty">No page has tags yet. Add `tags: [...]` to a page.</p>;
  return (
    <div className="sh-special-categories">
      {tags.map(([tag, list]) => (
        <Link key={tag} to={specialHref(wikiId, "categories", tag)} className="sh-section-card">
          <span className="sh-section-top">
            <span className="sh-section-name">{tag}</span>
            <span className="sh-special-count">{list.length}</span>
          </span>
          <span className="sh-section-summary">{list.map((p) => p.title).join(" · ")}</span>
        </Link>
      ))}
    </div>
  );
}

function Category({ wikiId, pages }: { wikiId: string; pages: PageEntry[] }) {
  if (!pages.length) return <p className="sh-special-empty">No pages are in this category.</p>;
  return (
    <div className="sh-sections-grid">
      {[...pages]
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((p) => (
          <PageCard key={p.path} wikiId={wikiId} page={p} />
        ))}
    </div>
  );
}

type TaskFilter = "open" | "done" | "all";

function Tasks({ wikiId, tasks }: { wikiId: string; tasks: TaskEntry[] }) {
  const [filter, setFilter] = useState<TaskFilter>("open");
  if (!tasks.length)
    return <p className="sh-special-empty">No page has a checklist yet. Write `- [ ] Something to do`.</p>;
  const byPage = new Map<string, TaskEntry[]>();
  for (const t of tasks) byPage.set(t.page.path, [...(byPage.get(t.page.path) ?? []), t]);
  const open = tasks.filter((t) => !t.done).length;
  return (
    <>
      <div className="sh-tasks-bar">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: `Open ${open}` },
            { value: "done", label: `Done ${tasks.length - open}` },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      {[...byPage].map(([path, list]) => {
        const shown = list.filter((t) => filter === "all" || (filter === "done") === t.done);
        if (!shown.length) return null;
        const done = list.filter((t) => t.done).length;
        const page = list[0].page;
        return (
          <section key={path} className="sh-special-group">
            <h2 className="sh-special-heading sh-tasks-heading">
              <Link to={pageHref(wikiId, path)} className="sh-special-link">
                <span aria-hidden="true">{page.icon ?? "📄"}</span>
                {page.title}
              </Link>
              <span
                className="sh-progress"
                role="progressbar"
                aria-valuenow={done}
                aria-valuemin={0}
                aria-valuemax={list.length}
              >
                <span className="sh-progress-track">
                  <span className="sh-progress-bar" style={{ width: `${(done / list.length) * 100}%` }} />
                </span>
                <span className="sh-progress-value">
                  {done}/{list.length}
                </span>
              </span>
            </h2>
            <ul className="sh-special-list">
              {shown.map((t, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: two tasks can read the same; order is stable.
                <li key={i} className="sh-task-row" data-done={t.done || undefined}>
                  <span
                    className="sh-task"
                    data-checked={t.done || undefined}
                    role="img"
                    aria-label={t.done ? "done" : "open"}
                  >
                    {t.done && <Icon name="check" size={12} />}
                  </span>
                  <span className="sh-task-text">{t.text}</span>
                  {t.section && (
                    <Link to={`${pageHref(wikiId, path)}#${t.section.id}`} className="sh-task-section">
                      {t.section.heading}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function Questions({ wikiId, questions }: { wikiId: string; questions: QuestionEntry[] }) {
  if (!questions.length) {
    return <p className="sh-special-empty">No page asks a question yet. Add `questions:` to a page's frontmatter.</p>;
  }
  const groups: [string, QuestionEntry[]][] = [
    ["Open", questions.filter((q) => q.status === "open")],
    ["Decided", questions.filter((q) => q.status === "resolved")],
  ];
  return (
    <>
      {groups
        .filter(([, list]) => list.length)
        .map(([label, list]) => (
          <section key={label} className="sh-special-group">
            <h2 className="sh-special-heading">{label}</h2>
            <ul className="sh-special-list">
              {list.map((q) => (
                <li key={`${q.page.path}#${q.id}`} className="sh-special-row">
                  <Link to={`${pageHref(wikiId, q.page.path)}#question-${q.id}`} className="sh-special-link">
                    {q.text}
                  </Link>
                  {q.status === "resolved" ? (
                    <span className="sh-special-answer">→ {q.answer ?? "decided"}</span>
                  ) : (
                    <span className="sh-special-count">
                      {q.answers} answer{q.answers === 1 ? "" : "s"}
                    </span>
                  )}
                  <span className="sh-special-summary">
                    {q.page.icon ?? "📄"} {q.page.title}
                    {q.options.length > 0 && ` · ${q.options.join(" / ")}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  );
}

function Wanted({ wikiId, wanted }: { wikiId: string; wanted: WantedPage[] }) {
  if (!wanted.length) return <p className="sh-special-empty">Every link points to a page that exists.</p>;
  return (
    <ul className="sh-special-list">
      {wanted.map((w) => (
        <li key={w.path} className="sh-special-row sh-wanted-row">
          <Link to={pageHref(wikiId, w.path)} className="sh-special-link sh-link" data-missing="">
            {w.title}
          </Link>
          <span className="sh-special-count">{w.from.length}</span>
          <span className="sh-wanted-from">
            {w.from.map((p) => (
              <PageChip key={p.path} wikiId={wikiId} page={p} />
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SpecialPage({ wiki, route, index }: { wiki: WikiDetail; route: string; index?: WikiIndex }) {
  const [name, ...rest] = route.split("/");
  const arg = rest.length ? decodeURIComponent(rest.join("/")) : null;
  const pages = (index?.pages ?? []).filter((p) => !p.hidden);
  const known = SPECIALS.find((s) => s.route === name);

  let head: { icon: string; title: string; summary: string };
  let body: ReactNode;
  if (name === "categories" && arg) {
    const inside = pages.filter((p) => p.tags.includes(arg));
    head = {
      icon: "🏷️",
      title: `Category: ${arg}`,
      summary: `${inside.length} page${inside.length === 1 ? "" : "s"} tagged “${arg}”.`,
    };
    body = <Category wikiId={wiki.id} pages={inside} />;
  } else if (known) {
    head = known;
    body =
      name === "recent" ? (
        <Recent wikiId={wiki.id} pages={pages} />
      ) : name === "tasks" ? (
        <Tasks wikiId={wiki.id} tasks={index?.tasks ?? []} />
      ) : name === "questions" ? (
        <Questions wikiId={wiki.id} questions={index?.questions ?? []} />
      ) : name === "wanted" ? (
        <Wanted wikiId={wiki.id} wanted={index?.wanted ?? []} />
      ) : name === "pages" ? (
        <AllPages wikiId={wiki.id} pages={pages} />
      ) : name === "kits" ? (
        <Kits wiki={wiki} />
      ) : name === "elements" ? (
        <Elements wiki={wiki} />
      ) : name === "fields" ? (
        <Fields />
      ) : name === "special" ? (
        <Specials wikiId={wiki.id} />
      ) : (
        <Categories wikiId={wiki.id} pages={pages} />
      );
  } else {
    head = { icon: "❓", title: "No such special page", summary: `There's no special page called “${route}”.` };
    body = <Specials wikiId={wiki.id} />;
  }
  // The toolbox reads its own data, not the page index.
  const ready = !!index || known?.group === "toolbox" || !known;

  useEffect(() => {
    document.title = `${head.title} · ${wiki.title}`;
  }, [head.title, wiki.title]);

  const home = index?.pages.find((p) => p.path === "");
  const trail = [
    { path: "", title: home?.title ?? wiki.title, icon: home?.icon, isPage: true },
    ...(arg ? [{ path: "_/categories", title: "Categories", icon: "🏷️", isPage: true }] : []),
  ];
  return (
    <main className="sh-wiki-main sh-special" data-path={`_/${route}`}>
      <header className="sh-page-head">
        <Crumbs wikiId={wiki.id} trail={trail} />
        <p className="sh-special-kicker">Special page</p>
        <h1 className="sh-page-title">
          <span className="sh-page-icon" aria-hidden="true">
            {head.icon}
          </span>
          {head.title}
        </h1>
        <p className="sh-page-summary">{head.summary}</p>
      </header>
      {ready ? body : <p className="sh-special-empty">Loading…</p>}
    </main>
  );
}
