import { useState } from "react";
import { recapHighlights, type RoomState } from "@fcdn/shared";
import { squadOf } from "../lib/board.js";
import { money } from "../lib/format.js";
import { useClubLabel } from "../lib/clubs.js";
import { Brand, Crest, Flap, Money, useClubVars } from "../ui/primitives.js";
import { Pitch } from "../board/Pitch.js";

export function FullTime({
  room,
  myId,
  onExport,
  onHome,
}: {
  room: RoomState;
  myId: string;
  onExport: () => void;
  onHome?: () => void;
}) {
  const label = useClubLabel();
  const clubVars = useClubVars();
  const h = recapHighlights(room);
  const mgr = (id: string) => room.managers[id]?.displayName ?? id;
  const plr = (id: string) => room.players[id]?.name ?? id;
  const [view, setView] = useState<"list" | "pitch">("list");

  const awards = [
    { title: "Most spent", who: mgr(h.mostSpent.managerId), n: h.mostSpent.amount },
    h.bestBargain && { title: "Best bargain", who: plr(h.bestBargain.playerId), n: h.bestBargain.price },
    h.biggestOverpay && { title: "Biggest overpay", who: plr(h.biggestOverpay.playerId), n: h.biggestOverpay.price },
  ].filter(Boolean) as { title: string; who: string; n: number }[];

  return (
    <div className="page page-wide">
      <div className="floodlights" aria-hidden="true" />
      <header className="page-head ft-head rise">
        <div>
          <p className="kicker">Draft complete · Season {room.seasonNumber}</p>
          <Brand size="md" tagline="Full time" />
        </div>
        <div className="ft-actions">
          <button className="btn btn-chalk" onClick={onExport}>Export season CSV</button>
          <button className="btn btn-ghost" onClick={() => onHome?.()}>Home</button>
        </div>
      </header>

      <div className="awards rise" style={{ animationDelay: "60ms" }}>
        {awards.map((a) => (
          <div key={a.title} className="award">
            <span className="kicker">{a.title}</span>
            <span className="award-who">{a.who}</span>
            <Flap size="md">{money(a.n)}</Flap>
          </div>
        ))}
      </div>

      <div className="tabs tabs-inline" role="tablist">
        <button role="tab" aria-selected={view === "list"} className={`tab ${view === "list" ? "is-on" : ""}`} onClick={() => setView("list")}>List</button>
        <button role="tab" aria-selected={view === "pitch"} className={`tab ${view === "pitch" ? "is-on" : ""}`} onClick={() => setView("pitch")}>Pitch</button>
      </div>

      <div className="ft-grid">
        {Object.values(room.managers).map((m, i) => {
          const squad = squadOf(room.players, m.id);
          return (
            <section key={m.id} className="sheet ft-team rise" style={{ ...clubVars(m.clubId), animationDelay: `${100 + i * 50}ms` }}>
              <header className="ft-team-head">
                <Crest clubId={m.clubId} size={34} />
                <div>
                  <h2 className="ft-team-name">{label(m.clubId)}</h2>
                  <span className="hint">{m.displayName}{m.id === myId ? " (you)" : ""} · <Money n={m.spendable} /> left</span>
                </div>
              </header>
              {view === "list" ? (
                <ul className="roster">
                  {squad.map((p) => (
                    <li key={p.id} className="roster-row">
                      <span className="roster-name">{p.name}</span>
                      <Money n={p.listedValue} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Pitch players={squad} />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
