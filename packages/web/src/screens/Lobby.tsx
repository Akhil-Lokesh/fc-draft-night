import type { RoomState } from "@fcdn/shared";
import { useState, type ReactNode } from "react";
import { clubClass, clubLabel } from "../lib/clubs.js";
import { money } from "../lib/format.js";

export function Lobby({
  room,
  myId,
  iAmHost,
  onStart,
  poolBuilder,
}: {
  room: RoomState;
  myId: string | null;
  iAmHost: boolean;
  onStart: () => void;
  poolBuilder?: ReactNode;
}) {
  const managers = Object.values(room.managers);
  const poolCount = Object.values(room.players).filter((p) => p.ownerId === null).length;
  const [openId, setOpenId] = useState<string | null>(null);
  const squadOf = (mid: string) =>
    Object.values(room.players)
      .filter((p) => p.ownerId === mid)
      .sort((a, b) => b.listedValue - a.listedValue);

  return (
    <div className="app-shell">
      <header style={{ paddingTop: 30, marginBottom: 16 }} className="rise">
        <div className="eyebrow">Lobby · Season {room.seasonNumber}</div>
        <div className="brand" aria-hidden="true" style={{ marginTop: 10 }}>
          <span className="fc" style={{ fontSize: 30 }}>FC</span>
          <span className="brand-word" style={{ fontSize: 30 }}>Draft Night</span>
        </div>
      </header>

      <div className="panel share-panel rise" style={{ marginBottom: 14 }}>
        <div className="panel-title">Room code</div>
        <div className="room-code mono">{room.code}</div>
        <div className="mono muted" style={{ fontSize: 13, marginTop: 6 }}>
          Budget <span className="money">{money(room.totalBudget)}</span> · quote timer {Math.round(room.quoteTimerMs / 60000)}m
          {room.squadSizeCap ? ` · cap ${room.squadSizeCap}` : ""}
        </div>
      </div>

      <div className="panel rise" style={{ marginBottom: 14, animationDelay: "0.05s" }}>
        <div className="panel-head">
          <span className="panel-title">Managers</span>
          <span className="mono muted" style={{ fontSize: 12 }}>{managers.length}/5</span>
        </div>
        <div className="lobby">
          {managers.map((m) => {
            const squad = squadOf(m.id);
            const open = openId === m.id;
            return (
              <div key={m.id}>
                <button
                  type="button"
                  className={`lobby-row lobby-row-btn club-chip ${clubClass(m.clubId)}`}
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : m.id)}
                >
                  <span className="lobby-name">{m.displayName}{m.id === myId ? " (you)" : ""}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{clubLabel(m.clubId)}</span>
                  <span className="money" style={{ marginLeft: 10, fontSize: 12 }}>{money(m.spendable)}</span>
                  <span className="lobby-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
                </button>
                {open && (
                  <div className="squad-reveal">
                    <div className="mono muted squad-reveal-head">
                      {squad.length} players · reserved <span className="money">{money(m.reserved)}</span>
                    </div>
                    {squad.map((p) => (
                      <div key={p.id} className="squad-reveal-row">
                        <span className="pill pill-pos">{p.position}</span>
                        <span className="squad-reveal-name">{p.name}</span>
                        <span className="money" style={{ marginLeft: "auto", fontSize: 12 }}>{money(p.listedValue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {iAmHost ? (
        <>
          {poolBuilder}
          <div className="panel rise" style={{ marginTop: 14 }}>
            <div className="mono muted" style={{ fontSize: 12, marginBottom: 10 }}>
              {poolCount} pool player{poolCount === 1 ? "" : "s"} added · {managers.length} manager{managers.length === 1 ? "" : "s"} in
            </div>
            <button className="btn btn-primary btn-block" onClick={onStart}>
              Start the draft
            </button>
          </div>
        </>
      ) : (
        <div className="panel rise" style={{ textAlign: "center", padding: "22px 16px" }}>
          <div className="pill pill-live" style={{ marginBottom: 10 }}>waiting</div>
          <p className="muted" style={{ margin: 0 }}>Waiting for the host to start the draft…</p>
        </div>
      )}
    </div>
  );
}
