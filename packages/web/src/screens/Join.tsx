import { useState } from "react";
import { CLUBS } from "../lib/clubs.js";

export interface JoinFields { code: string; displayName: string; clubId: string; }

export function Join({
  join,
  takenClubs,
  capacity,
  managerCount,
  initialCode = "",
  onCodeChange,
}: {
  join: (p: JoinFields) => void;
  takenClubs: string[];
  capacity?: number;
  managerCount?: number;
  initialCode?: string;
  /** Fires as the room code changes, so the caller can peek live capacity/taken-clubs before joining. */
  onCodeChange?: (code: string) => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [displayName, setName] = useState("");
  const [clubId, setClub] = useState<string | null>(null);
  const roomFull = capacity !== undefined && managerCount !== undefined && managerCount >= capacity;

  const ready = !roomFull && code.trim().length > 0 && displayName.trim().length > 0 && clubId !== null;
  const submit = () => {
    if (!ready) return;
    join({ code: code.trim().toUpperCase(), displayName: displayName.trim(), clubId: clubId! });
  };

  return (
    <div className="app-shell">
      <header style={{ paddingTop: 40, marginBottom: 24 }} className="rise">
        <div className="eyebrow">Join the draft</div>
        <div className="brand" aria-hidden="true" style={{ marginTop: 12 }}>
          <span className="fc">FC</span>
          <span className="brand-word" style={{ fontSize: "clamp(30px,10vw,44px)" }}>Draft Night</span>
        </div>
      </header>

      <div className="panel rise" style={{ animationDelay: "0.06s" }}>
        <div className="field">
          <label className="label" htmlFor="join-code">Room code</label>
          <input
            id="join-code"
            className="input mono"
            style={{ letterSpacing: "0.3em", textTransform: "uppercase", fontSize: 20 }}
            value={code}
            autoComplete="off"
            placeholder="XXXX"
            onChange={(e) => {
              const next = e.target.value.toUpperCase();
              setCode(next);
              onCodeChange?.(next);
            }}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="join-name">Your name</label>
          <input
            id="join-name"
            className="input"
            value={displayName}
            placeholder="e.g. Ana"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <span className="label">Pick your club</span>
          <div className="club-grid">
            {CLUBS.map((c) => {
              const clubTaken = takenClubs.includes(c.id);
              const taken = roomFull || clubTaken;
              const selected = clubId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={taken}
                  aria-pressed={selected}
                  className={`club-option ${c.className} ${selected ? "is-selected" : ""}`}
                  onClick={() => setClub(c.id)}
                >
                  <span className="club-dot" />
                  <span className="club-name">{c.label}</span>
                  {taken && <span className="pill" style={{ marginLeft: "auto" }}>{clubTaken ? "taken" : "full"}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {roomFull && <div className="inline-error" role="alert">This room is full.</div>}

        <button className="btn btn-primary btn-block" disabled={!ready} onClick={submit}>
          Join
        </button>
      </div>
    </div>
  );
}
