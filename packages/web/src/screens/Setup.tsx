import { useState } from "react";
import { FIVE_STAR_BUDGET, STANDING_BONUS, MAX_MANAGERS } from "@fcdn/shared";
import { Brand } from "../ui/primitives.js";
import { isLocalHost } from "../lib/env.js";

export interface StartConfig {
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

export function Setup({
  onStart,
  startLabel = "Start draft",
  onBack,
  allowTestRoom = isLocalHost(window.location.hostname),
}: {
  onStart: (cfg: StartConfig) => void;
  /** The solo test room is a local development tool: offered only on localhost, never on the public site. */
  allowTestRoom?: boolean;
  startLabel?: string;
  onBack?: () => void;
}) {
  const [timerMin, setTimerMin] = useState(5);
  const [rosterCsv, setRosterCsv] = useState<string | null>(null);
  const [rosterName, setRosterName] = useState<string | null>(null);
  const [capacity, setCapacity] = useState(2);
  const [testRoom, setTestRoom] = useState(false);

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
    onStart({
      quoteTimerMs: timerMin * 60_000,
      squadSizeCap: null,
      capacity,
      rosterCsv,
      testMode: (allowTestRoom && testRoom) || undefined,
    });
  };

  return (
    <div className="page page-narrow">
      <header className="page-head rise">
        {onBack && <button className="btn btn-text" onClick={onBack}>← Back</button>}
        <Brand size="md" />
      </header>

      <form
        className="form rise"
        style={{ animationDelay: "60ms" }}
        onSubmit={(e) => { e.preventDefault(); start(); }}
      >
        <aside className="budget-note" role="note" aria-label="Budgets">
          <span className="budget-note-tag">Budgets</span>
          <p>
            <b>€{FIVE_STAR_BUDGET}M</b> for a 5-star club, <b>€150M</b> less for every half star below.
          </p>
          <p>
            From season 2: your leftover money from last season plus <b>€{STANDING_BONUS}M</b> for every league place above last.
          </p>
        </aside>

        <fieldset className="group">
          <legend className="group-legend"><span>01</span> Roster</legend>
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
          <legend className="group-legend"><span>02</span> Clock</legend>
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
            <p className="hint">How long the other side has to answer a challenge. Every reply after that gets 2 minutes.</p>
          </div>
        </fieldset>

        {allowTestRoom && (
          <fieldset className="group">
            <legend className="group-legend"><span>03</span> Testing</legend>
            <label className="check">
              <input type="checkbox" checked={testRoom} onChange={(e) => setTestRoom(e.target.checked)} />
              <span>
                <b>Test room</b>
                <span className="hint">Start alone and play every seat yourself. Empty seats become practice managers you can switch between during the draft.</span>
              </span>
            </label>
          </fieldset>
        )}

        <button type="submit" className="btn btn-flare btn-lg btn-block" disabled={!rosterCsv}>{startLabel}</button>
      </form>

      <section className="howto rise" style={{ animationDelay: "120ms" }} aria-labelledby="howto-title">
        <h2 id="howto-title" className="howto-title">How it works</h2>
        <ol className="howto-list">
          <li>
            <b>Prepare your roster.</b> Download the roster template (link in the Roster box above) and list every club's squad. Names are checked against the FC26 database.
          </li>
          <li>
            <b>Upload your roster file.</b> Choose the CSV above, set how many managers play and the quote timer.
          </li>
          <li>
            <b>Create the room.</b> You get a room code and an invite link. Send it to your managers.
          </li>
          <li>
            <b>Everyone joins.</b> Each manager enters the code, picks a name and a club. Press Start when the room is full.
          </li>
          <li>
            <b>Draft.</b> Claim free agents, challenge rivals' players and defend your own until the clock runs out. The auction ends once everyone is at zero or better.
          </li>
        </ol>
      </section>
    </div>
  );
}
