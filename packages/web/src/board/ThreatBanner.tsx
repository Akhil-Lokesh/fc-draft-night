import { useState } from "react";
import type { RoomState } from "@fcdn/shared";
import { threatsFor } from "../lib/board.js";
import { money } from "../lib/format.js";
import { useClubLabel } from "../lib/clubs.js";

/** Full-width red alert while any of my players has a rival on top. Defend = top + 1.
 *  The cross hides one alert on this screen only — the contest carries on. Dismissal is keyed to
 *  the bid it was dismissed at, so a fresh raise by the rival brings the alert straight back. */
export function ThreatBanner({ room, myId, onDefend }: { room: RoomState; myId: string; onDefend: (contestId: string, amount: number) => void }) {
  const label = useClubLabel();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const keyOf = (id: string, amount: number) => `${id}@${amount}`;
  const threats = threatsFor(room, myId).filter((c) => !dismissed.has(keyOf(c.id, c.quotes.at(-1)!.amount)));
  if (threats.length === 0) return null;

  return (
    <div className="threat" role="alert">
      {threats.map((c) => {
        const player = room.players[c.playerId]!;
        const top = c.quotes.at(-1)!;
        const rival = room.managers[top.managerId];
        return (
          <div key={c.id} className="threat-row">
            <span className="threat-flash" aria-hidden="true">Under threat</span>
            <p className="threat-text">
              Your player <b>{player.name}</b> is being challenged at <span className="money">{money(top.amount)}</span>
              {rival ? <> by {label(rival.clubId)}</> : null}
            </p>
            <button className="btn btn-chalk" onClick={() => onDefend(c.id, top.amount + 1)}>
              Defend · {money(top.amount + 1)}
            </button>
            <button
              type="button"
              className="threat-x"
              aria-label={`Dismiss alert for ${player.name}`}
              onClick={() => setDismissed((prev) => new Set(prev).add(keyOf(c.id, top.amount)))}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
