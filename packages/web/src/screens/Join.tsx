import { useMemo, useState, type CSSProperties } from "react";
import { TEAM_PALETTE } from "@fcdn/shared";
import { CLUBS, TeamColors } from "../lib/clubs.js";
import { Brand, Crest } from "../ui/primitives.js";

export interface JoinFields { code: string; displayName: string; clubId: string }
export interface PickableClub { id: string; label: string }

const DEFAULT_CLUBS: PickableClub[] = CLUBS.map((c) => ({ id: c.id, label: c.label }));

export function Join({
  join,
  takenClubs,
  capacity,
  managerCount,
  initialCode = "",
  onCodeChange,
  clubs = DEFAULT_CLUBS,
  onBack,
}: {
  join: (p: JoinFields) => void;
  takenClubs: string[];
  capacity?: number;
  managerCount?: number;
  initialCode?: string;
  /** Fires as the code changes so the caller can peek capacity / taken clubs live. */
  onCodeChange?: (code: string) => void;
  /** This room's pickable clubs: an uploaded roster's, or the built-in 5. */
  clubs?: PickableClub[];
  onBack?: () => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [displayName, setName] = useState("");
  const [clubId, setClub] = useState<string | null>(null);
  const clubColors = useMemo(
    () => Object.fromEntries(clubs.map((c, i) => [c.id, TEAM_PALETTE[i % TEAM_PALETTE.length]!])),
    [clubs],
  );
  const pick = clubId ? clubColors[clubId] : undefined;
  const roomFull = capacity !== undefined && managerCount !== undefined && managerCount >= capacity;
  const ready = !roomFull && code.trim().length > 0 && displayName.trim().length > 0 && clubId !== null;

  const submit = () => {
    if (!ready) return;
    join({ code: code.trim().toUpperCase(), displayName: displayName.trim(), clubId: clubId! });
  };

  return (
    <div className="page page-narrow">
      <header className="page-head rise">
        {onBack && <button className="btn btn-text" onClick={onBack}>← Back</button>}
        <p className="kicker">Join the draft</p>
        <Brand size="md" />
      </header>

      <form
        className="form rise"
        // Picking a club previews its team colour on the Join button (and focus rings).
        style={{ animationDelay: "60ms", ...(pick ? { "--flare": pick.color, "--flare-ink": pick.ink, "--flare-soft": `color-mix(in srgb, ${pick.color} 14%, transparent)` } : {}) } as CSSProperties}
        onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="field">
          <label className="label" htmlFor="join-code">Room code</label>
          <input
            id="join-code"
            className="input input-code"
            value={code}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="R0000"
            onChange={(e) => {
              const next = e.target.value.toUpperCase();
              setCode(next);
              onCodeChange?.(next);
            }}
          />
          {capacity !== undefined && managerCount !== undefined && (
            <p className="hint">{managerCount} of {capacity} managers in</p>
          )}
        </div>

        <div className="field">
          <label className="label" htmlFor="join-name">Your name</label>
          <input id="join-name" className="input" value={displayName} placeholder="e.g. Ana" autoComplete="nickname"
            onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <span className="label" id="club-label">Pick your club</span>
          {/* Each club's team colour is its slot in the room's club list — the same colour it will
           *  have in the room — so show it right here while choosing. */}
          <TeamColors.Provider value={clubColors}>
          <div className="club-grid" role="group" aria-labelledby="club-label">
            {clubs.map((c) => {
              const clubTaken = takenClubs.includes(c.id);
              const disabled = roomFull || clubTaken;
              const selected = clubId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  className={`club-card ${selected ? "is-on" : ""}`}
                  style={{ "--club": clubColors[c.id]!.color, "--club-ink": clubColors[c.id]!.ink } as CSSProperties}
                  onClick={() => setClub(c.id)}
                >
                  <Crest clubId={c.id} size={34} />
                  <span className="club-card-name">{c.label}</span>
                  {disabled && <span className="club-card-flag">{clubTaken ? "taken" : "full"}</span>}
                </button>
              );
            })}
          </div>
          </TeamColors.Provider>
        </div>

        {roomFull && <div className="inline-error" role="alert">This room is full.</div>}

        <button type="submit" className="btn btn-flare btn-lg btn-block" disabled={!ready}>Join</button>
      </form>
    </div>
  );
}
