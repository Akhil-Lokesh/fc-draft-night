import { useState } from "react";
import { Brand } from "../ui/primitives.js";

export interface StartConfig {
  totalBudget: number;
  quoteTimerMs: number;
  squadSizeCap: number | null;
  capacity?: number;
  rosterCsv?: string;
}

/** Rough client-side count of distinct clubs in an uploaded roster — only sizes the "how many
 *  managers" picker; the server re-parses everything. Handles plain "club,player" CSVs and the
 *  tournament format (counts only inside "## SQUADS" when present). */
export function countClubs(csv: string): number {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const squadsStart = lines.findIndex((l) => /^##\s*squads/i.test(l));
  let rows: string[];
  if (squadsStart >= 0) {
    const after = lines.slice(squadsStart + 1);
    const next = after.findIndex((l) => l.startsWith("##"));
    rows = (next >= 0 ? after.slice(0, next) : after).filter((l) => !l.startsWith("#"));
  } else {
    rows = lines.filter((l) => !l.startsWith("#"));
  }
  rows = rows.slice(1); // the section's own header row
  return new Set(rows.map((l) => l.split(",")[0]!.trim().toLowerCase()).filter(Boolean)).size;
}

const TIMER_OPTIONS = [1, 2, 3, 5];

/** Tolerate a stray "€", "M" or spaces next to the number. */
const parseAmount = (raw: string): number => Number(raw.replace(/[^\d.]/g, ""));

export function Setup({
  floor,
  onStart,
  maxCapacity = 5,
  startLabel = "Start draft",
  onBack,
}: {
  floor: number;
  onStart: (cfg: StartConfig) => void;
  /** Kept for callers; the picker is sized from maxCapacity / the roster. */
  managerCount?: number;
  maxCapacity?: number;
  startLabel?: string;
  onBack?: () => void;
}) {
  const [budget, setBudget] = useState(String(floor));
  const [timerMin, setTimerMin] = useState(5);
  const [cap, setCap] = useState("");
  const [rosterCsv, setRosterCsv] = useState<string | null>(null);
  const [rosterName, setRosterName] = useState<string | null>(null);
  const [capacity, setCapacity] = useState(maxCapacity);
  const [error, setError] = useState<string | null>(null);

  const effectiveMax = rosterCsv ? Math.max(2, countClubs(rosterCsv)) : maxCapacity;
  const capacityOptions = Array.from({ length: effectiveMax - 1 }, (_, i) => i + 2);

  const onRosterFile = (file: File | undefined) => {
    if (!file) { setRosterCsv(null); setRosterName(null); setCapacity(maxCapacity); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setRosterCsv(text);
      setRosterName(file.name);
      setCapacity(Math.max(2, countClubs(text)));
    };
    reader.readAsText(file);
  };

  const start = () => {
    const total = parseAmount(budget);
    if (!Number.isFinite(total) || total < floor) {
      setError(`Budget is below the floor (€${floor}M). The priciest real squad must fit.`);
      return;
    }
    setError(null);
    onStart({
      totalBudget: total,
      quoteTimerMs: timerMin * 60_000,
      squadSizeCap: cap.trim() ? parseAmount(cap) : null,
      capacity,
      rosterCsv: rosterCsv ?? undefined,
    });
  };

  return (
    <div className="page page-narrow">
      <header className="page-head rise">
        {onBack && <button className="btn btn-text" onClick={onBack}>← Back</button>}
        <p className="kicker">Host setup</p>
        <Brand size="md" />
      </header>

      <form
        className="form rise"
        style={{ animationDelay: "60ms" }}
        onSubmit={(e) => { e.preventDefault(); start(); }}
      >
        <fieldset className="group">
          <legend className="group-legend"><span>01</span> Money</legend>
          <div className="field">
            <label className="label" htmlFor="setup-budget">Total budget per manager (€M)</label>
            <div className="input-money">
              <span aria-hidden="true">€</span>
              <input id="setup-budget" type="text" inputMode="decimal" className="input input-xl"
                value={budget} onChange={(e) => setBudget(e.target.value)} />
              <span aria-hidden="true">M</span>
            </div>
            <p className="hint">Floor €{floor}M. The priciest real squad has to fit.</p>
          </div>
          <div className="field">
            <label className="label" htmlFor="setup-cap">Squad cap (optional)</label>
            <input id="setup-cap" type="number" className="input" placeholder="No cap" value={cap} onChange={(e) => setCap(e.target.value)} />
          </div>
        </fieldset>

        <fieldset className="group">
          <legend className="group-legend"><span>02</span> Clubs</legend>
          <div className="field">
            <label className="label" htmlFor="setup-roster">Upload a roster (optional)</label>
            <label className={`drop ${rosterName ? "is-loaded" : ""}`}>
              <input id="setup-roster" type="file" accept=".csv,text/csv" className="drop-input"
                onChange={(e) => onRosterFile(e.target.files?.[0])} />
              <span className="drop-title">{rosterName ?? "Choose a CSV"}</span>
              <span className="hint">
                {rosterName
                  ? `${effectiveMax} club(s) found. Every player is cross-checked against the FC26 database.`
                  : "\"club,player\" rows, any real FC26 club. Skip this to play the built-in 5."}
              </span>
            </label>
          </div>
          <div className="field">
            <label className="label" htmlFor="setup-capacity">How many managers?</label>
            <select id="setup-capacity" className="input" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
              {capacityOptions.map((n) => <option key={n} value={n}>{n} managers</option>)}
            </select>
            <p className="hint">One real club per manager. No duplicates.</p>
          </div>
        </fieldset>

        <fieldset className="group">
          <legend className="group-legend"><span>03</span> Clock</legend>
          <div className="field">
            <span className="label" id="timer-label">Quote timer</span>
            <div className="segmented" role="radiogroup" aria-labelledby="timer-label">
              {TIMER_OPTIONS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={timerMin === m}
                  className={`seg ${timerMin === m ? "is-on" : ""}`} onClick={() => setTimerMin(m)}>
                  {m} min
                </button>
              ))}
            </div>
            <p className="hint">Each war's countdown. It resets on every bid.</p>
          </div>
        </fieldset>

        {error && <div className="inline-error" role="alert">{error}</div>}

        <p className="hint center">Next you get a room code to share, then pick your own name and club.</p>
        <button type="submit" className="btn btn-flare btn-lg btn-block">{startLabel}</button>
      </form>
    </div>
  );
}
