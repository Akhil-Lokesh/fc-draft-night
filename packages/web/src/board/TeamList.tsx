import { useState } from "react";
import type { Manager, Player } from "@fcdn/shared";
import { positionLabel } from "../lib/format.js";
import { squadOf } from "../lib/board.js";
import { useClubLabel } from "../lib/clubs.js";
import { Crest, Money, Pos, useClubVars } from "../ui/primitives.js";
import { VoiceRing } from "./Voice.js";

/** Expandable list of every manager. Tap a team to reveal who they own right now. */
export function TeamList({
  players,
  managers,
  myId,
  showSpendable = false,
}: {
  players: Record<string, Player>;
  managers: Record<string, Manager>;
  myId?: string | null;
  showSpendable?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const label = useClubLabel();
  const clubVars = useClubVars();

  return (
    <ul className="teams">
      {Object.values(managers).map((m) => {
        const squad = squadOf(players, m.id);
        const open = openId === m.id;
        return (
          <li key={m.id} className={`team ${open ? "is-open" : ""}`} style={clubVars(m.clubId)}>
            <button type="button" className="team-row" aria-expanded={open} onClick={() => setOpenId(open ? null : m.id)}>
              <VoiceRing managerId={m.id}><Crest clubId={m.clubId} size={26} /></VoiceRing>
              <span className="team-names">
                <span className="team-club">{label(m.clubId)}</span>
                <span className="team-mgr">{m.displayName}{m.id === myId ? " · you" : ""}</span>
              </span>
              {showSpendable ? <Money n={m.spendable} className="team-money" /> : <span className="team-count">{squad.length}</span>}
              <span className="caret" aria-hidden="true" />
            </button>
            {open && (
              <div className="team-body">
                <div className="team-meta">{squad.length} players · reserved <Money n={m.reserved} /></div>
                {squad.length === 0 && <div className="empty">No players yet.</div>}
                <ul className="roster">
                  {squad.map((p) => (
                    <li key={p.id} className="roster-row">
                      <span className="roster-name">{p.shirtNumber ? <i>{p.shirtNumber}</i> : null}{p.name}</span>
                      <Pos>{positionLabel(p)}</Pos>
                      <Money n={p.listedValue} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
