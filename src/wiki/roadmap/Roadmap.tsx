// `::::roadmap`: release by release down the page, the version big on the left; finished ones fold away, the rest
// stay open.
import { type ReactNode, useMemo } from "react";
import { Icon } from "../../ui/index.ts";
import { currentIndex, type MilestoneProps, milestonesOf, versionLabel } from "./model.ts";
import { Bar, Goal, Name, StatusTag } from "./parts.tsx";
import "./roadmap.css";

export function RoadmapEl({ children }: { children?: ReactNode }) {
  const list = useMemo(() => milestonesOf(children), [children]);
  if (!list.length) return null;
  const at = currentIndex(list);
  return (
    <div className="sh-rm">
      <ol className="sh-rm-chapters">
        {list.map((m, i) => (
          <li key={m.title} className="sh-rm-chapter" data-status={m.status} data-current={i === at || undefined}>
            <div className="sh-rm-chapter-side">
              <span className="sh-rm-chapter-number">
                {m.version ? versionLabel(m.version) : String(i + 1).padStart(2, "0")}
              </span>
              {m.when && <span className="sh-rm-chapter-when">{m.when}</span>}
            </div>
            <span className="sh-rm-chapter-dot" aria-hidden="true">
              {m.status === "done" && <Icon name="check" size={12} />}
            </span>
            <details className="sh-rm-chapter-card" open={m.status !== "done"}>
              <summary>
                <span className="sh-rm-chapter-title">
                  <Name m={m} />
                </span>
                <StatusTag status={m.status} />
                <Bar m={m} />
                <span className="sh-rm-chapter-chevron">
                  <Icon name="chevronDown" size={16} />
                </span>
              </summary>
              <div className="sh-rm-chapter-body">
                <Goal m={m} />
                <div className="sh-rm-body">{m.body}</div>
              </div>
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A milestone is read by its roadmap, which places its parts. */
export const RoadmapMilestoneEl = ({ children }: MilestoneProps) => <>{children}</>;
