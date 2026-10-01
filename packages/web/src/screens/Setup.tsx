import { useState } from "react";
import { MAX_MANAGERS } from "@fcdn/shared";
import { Brand } from "../ui/primitives.js";

export interface StartConfig {
  totalBudget: number;
  quoteTimerMs: number;
  squadSizeCap: number | null;
  capacity?: number;
  rosterCsv?: string;
  testMode?: boolean;
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
  startLabel = "Start draft",
  onBack,
}: {
  floor: number;
  onStart: (cfg: StartConfig) => void;
  startLabel?: string;
  onBack?: () => void;
}) {
  const [budget, setBudget] = useState(String(floor));
  const [timerMin, setTimerMin] = useState(5);
  const [cap, setCap] = useState("");
  const [rosterCsv, setRosterCsv] = useState<string | null>(null);
  const [rosterName, setRosterName] = useState<string | null>(null);
  const [capacity, setCapacity] = useState(2);
  const [testRoom, setTestRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // There are no built-in teams: every club comes from the roster. One colour per manager, so never
  // more than MAX_MANAGERS however many clubs it names.
  const effectiveMax = rosterCsv ? Math.min(MAX_MANAGERS, Math.max(2, countClubs(rosterCsv))) : 0;
  const capacityOptions = Array.from({ length: Math.max(0, effectiveMax - 1) }, (_, i) => i + 2);

  const onRosterFile = (file: File | undefined) => {
    if (!file) { setRosterCsv(null); setRosterName(null); setCapacity(2); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setRosterCsv(text);
      setRosterName(file.name);
      setCapacity(Math.min(MAX_MANAGERS, Math.max(2, countClubs(text))));
    };
    reader.readAsText(file);
  };

  const start = () => {
    if (!rosterCsv) return; // the button is disabled too; a room has no teams without a roster
    const total = parseAmount(budget);
    if (!Number.isFinite(total) || total < floor) {
      setError(`Budget is below the floor (€${floor}M): a 5-star club needs at least that.`);
      return;
    }
    setError(null);
    onStart({
      totalBudget: total,
      quoteTimerMs: timerMin * 60_000,
      squadSizeCap: cap.trim() ? parseAmount(cap) : null,
      capacity,
      rosterCsv,
      testMode: testRoom || undefined,
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
            <label className="label" htmlFor="setup-budget">Total budget for a 5-star club (€M)</label>
            <div className="input-money">
              <span aria-hidden="true">€</span>
              <input id="setup-budget" type="text" inputMode="decimal" className="input input-xl"
                value={budget} onChange={(e) => setBudget(e.target.value)} />
              <span aria-hidden="true">M</span>
            </div>
            <p className="hint">
              Minimum €{floor}M. Each half-star lower gets €150M less. A squad worth more than its club's budget starts
              over budget, and that manager must release players before the auction can end.
            </p>
          </div>
          <div className="field">
            <label className="label" htmlFor="setup-cap">Squad cap (optional)</label>
            <input id="setup-cap" type="number" className="input" placeholder="No cap" value={cap} onChange={(e) => setCap(e.target.value)} />
          </div>
        </fieldset>

        <fieldset className="group">
          <legend className="group-legend"><span>02</span> Clubs</legend>
          <div className="field">
            <label className="label" htmlFor="setup-roster">Upload your roster</label>
            <label className={`drop ${rosterName ? "is-loaded" : ""}`}>
              <input id="setup-roster" type="file" accept=".csv,text/csv" className="drop-input"
                onChange={(e) => onRosterFile(e.target.files?.[0])} />
              <span className="drop-title">{rosterName ?? "Choose a CSV"}</span>
              <span className="hint">
                {rosterName
                  ? `${effectiveMax} club(s) found. Every player is cross-checked against the FC26 database.`
                  : "Your teams and squads come only from this file: \"club,player\" rows, any real FC26 club."}
              </span>
            </label>
            <p className="hint"><a href="/roster-template.csv" download>Download the roster template</a> to see the format.</p>
          </div>
          {rosterCsv && (
            <div className="field">
              <label className="label" htmlFor="setup-capacity">How many managers?</label>
              <select id="setup-capacity" className="input" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
                {capacityOptions.map((n) => <option key={n} value={n}>{n} managers</option>)}
              </select>
              <p className="hint">One real club per manager. No duplicates.</p>
            </div>
          )}
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

        <fieldset className="group">
          <legend className="group-legend"><span>04</span> Testing</legend>
          <label className="check">
            <input type="checkbox" checked={testRoom} onChange={(e) => setTestRoom(e.target.checked)} />
            <span>
              <b>Test room</b>
              <span className="hint">Start alone and play every seat yourself. Empty seats become practice managers you can switch between during the draft.</span>
            </span>
          </label>
        </fieldset>

        {error && <div className="inline-error" role="alert">{error}</div>}

        {!rosterCsv && <p className="hint center">Upload a roster to create a room: every team and player comes from your file.</p>}
        <p className="hint center">Next you get a room code to share, then pick your own name and club.</p>
        <button type="submit" className="btn btn-flare btn-lg btn-block" disabled={!rosterCsv}>{startLabel}</button>
      </form>
    </div>
  );
}
