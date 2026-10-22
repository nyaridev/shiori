// The parts of a roadmap milestone: its status, its name, when it is done, and how far its tasks are.
import { Badge, type BadgeTone, Icon } from "../../ui/index.ts";
import { PageIcon } from "../PageIcon.tsx";
import { type Milestone, type MilestoneStatus, STATUS_LABEL } from "./model.ts";

const TONE: Record<MilestoneStatus, BadgeTone> = { done: "good", now: "accent", next: "neutral", later: "neutral" };

export const StatusTag = ({ status }: { status: MilestoneStatus }) => (
  <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>
);

/** The milestone's name with its icon. */
export const Name = ({ m }: { m: Milestone }) => (
  <>
    {m.icon && <PageIcon icon={m.icon} />}
    {m.title}
  </>
);

/** "Done when …", the line that says when to move on. */
export const Goal = ({ m }: { m: Milestone }) =>
  m.goal ? (
    <p className="sh-rm-goal">
      <Icon name="check" size={14} />
      <span>
        <span className="sh-rm-goal-label">Done when</span> {m.goal}
      </span>
    </p>
  ) : null;

const pct = (m: Pick<Milestone, "done" | "total">) => (m.total ? Math.round((m.done / m.total) * 100) : 0);

/** A thin bar of the ticked tasks, with "3/5". */
export function Bar({ m }: { m: Pick<Milestone, "done" | "total"> }) {
  if (!m.total) return null;
  return (
    <span
      className="sh-rm-bar"
      role="progressbar"
      aria-label="Tasks done"
      aria-valuenow={m.done}
      aria-valuemin={0}
      aria-valuemax={m.total}
    >
      <span className="sh-rm-bar-track">
        <span className="sh-rm-bar-fill" style={{ width: `${pct(m)}%` }} />
      </span>
      <span className="sh-rm-bar-count">
        {m.done}/{m.total}
      </span>
    </span>
  );
}
