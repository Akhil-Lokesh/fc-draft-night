import { useState, type ReactNode } from "react";
import { clubClass, clubLabel } from "../lib/clubs.js";

export interface StartConfig {
  totalBudget: number;
  quoteTimerMs: number;
  squadSizeCap: number | null;
  capacity?: number;
}

const TIMER_OPTIONS = [1, 2, 3, 5];

export function Setup({
  floor,
  onStart,
  managerCount,
  maxCapacity = 5,
  code,
  joined = [],
  startLabel = "Start draft",
  children,
}: {
  floor: number;
  onStart: (cfg: StartConfig) => void;
  managerCount: number;
  maxCapacity?: number;
  code?: string;
  joined?: { id: string; displayName: string; clubId: string }[];
  startLabel?: string;
  children?: ReactNode;
}) {
  const [budget, setBudget] = useState(String(floor));
  const [timerMin, setTimerMin] = useState(5);
  const [cap, setCap] = useState("");
  const [capacity, setCapacity] = useState(maxCapacity);
  const [error, setError] = useState<string | null>(null);
  const capacityOptions = Array.from({ length: maxCapacity - 1 }, (_, i) => i + 2); // 2..maxCapacity

  // Tolerate a stray "€"/"M"/spaces a host may type next to the number — parse the digits only.
  const parseAmount = (raw: string): number => Number(raw.replace(/[^\d.]/g, ""));

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
    });
  };

  return (
    <div className="app-shell">
      <header style={{ paddingTop: 34, marginBottom: 18 }} className="rise">
        <div className="eyebrow">Host setup</div>
        <div className="brand" aria-hidden="true" style={{ marginTop: 10 }}>
          <span className="fc">FC</span>
          <span className="brand-word" style={{ fontSize: "clamp(26px,9vw,40px)" }}>Draft Night</span>
        </div>
      </header>

      {code && (
        <div className="panel rise share-panel" style={{ marginBottom: 14 }}>
          <div className="panel-title">Share this code</div>
          <div className="room-code mono">{code}</div>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
            Everyone else opens the app and joins with this code.
          </p>
        </div>
      )}

      <div className="panel rise" style={{ animationDelay: "0.05s", marginBottom: 14 }}>
        <div className="panel-title" style={{ marginBottom: 12 }}>Draft rules</div>

        <div className="field">
          <label className="label" htmlFor="setup-budget">Total budget per manager (€M)</label>
          <input
            id="setup-budget"
            type="text"
            inputMode="decimal"
            className="input mono"
            style={{ fontSize: 20 }}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          <p className="muted mono" style={{ margin: "7px 0 0", fontSize: 12 }}>
            Floor €{floor}M — the priciest real squad must fit.
          </p>
        </div>

        <div className="field">
          <label className="label" htmlFor="setup-capacity">How many managers?</label>
          <select
            id="setup-capacity"
            className="input mono"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          >
            {capacityOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <p className="muted mono" style={{ margin: "7px 0 0", fontSize: 12 }}>
            One real club's squad per manager — no duplicates, no international sides.
          </p>
        </div>

        <div className="field-row">
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label className="label" htmlFor="setup-timer">Quote timer</label>
            <select
              id="setup-timer"
              className="input mono"
              value={timerMin}
              onChange={(e) => setTimerMin(Number(e.target.value))}
            >
              {TIMER_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label className="label" htmlFor="setup-cap">Squad cap (optional)</label>
            <input
              id="setup-cap"
              type="number"
              className="input mono"
              placeholder="none"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="inline-error" role="alert">{error}</div>}
      </div>

      {children}

      {joined.length > 0 && (
        <div className="panel rise" style={{ animationDelay: "0.1s", marginTop: 14 }}>
          <div className="panel-head">
            <span className="panel-title">Managers</span>
            <span className="mono muted" style={{ fontSize: 12 }}>{joined.length}/{managerCount}</span>
          </div>
          <div className="lobby">
            {joined.map((m) => (
              <div key={m.id} className={`lobby-row club-chip ${clubClass(m.clubId)}`}>
                <span className="lobby-name">{m.displayName}</span>
                <span className="muted" style={{ fontSize: 12 }}>{clubLabel(m.clubId)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="muted" style={{ fontSize: 13, textAlign: "center", margin: "16px 4px 0", lineHeight: 1.5 }}>
        Next: you’ll get a shareable room code, then pick your name and club. Other
        managers join from their phones with that code.
      </p>

      <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={start}>
        {startLabel}
      </button>
    </div>
  );
}
