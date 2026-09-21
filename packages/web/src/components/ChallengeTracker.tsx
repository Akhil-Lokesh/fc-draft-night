import type { Manager } from "@fcdn/shared";
import { clubClass } from "../lib/clubs.js";

const MAX_PER_RIVAL = 3;

export function ChallengeTracker({
  challenges,
  myId,
  managers,
}: {
  challenges: Record<string, number>;
  myId: string;
  managers: Record<string, Pick<Manager, "displayName" | "clubId"> & Partial<Manager>>;
}) {
  const rivals = Object.entries(managers).filter(([id]) => id !== myId);
  return (
    <div className="tracker">
      {rivals.map(([rivalId, m]) => {
        const used = challenges[`${myId}->${rivalId}`] ?? 0;
        const exhausted = used >= MAX_PER_RIVAL;
        return (
          <div key={rivalId} className="tracker-row">
            <span className={`club-chip ${clubClass(m.clubId ?? "")}`}>{m.displayName}</span>
            <span className="tracker-pips" aria-hidden="true">
              {Array.from({ length: MAX_PER_RIVAL }, (_, i) => (
                <span key={i} className={`pip ${i < used ? "spent" : ""}`} />
              ))}
            </span>
            <span className={`mono tracker-count ${exhausted ? "is-max" : ""}`}>{used} / {MAX_PER_RIVAL}</span>
          </div>
        );
      })}
      {rivals.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No rivals yet.</div>}
    </div>
  );
}
