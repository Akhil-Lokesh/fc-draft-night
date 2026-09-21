import { useState } from "react";
import type { CatalogPlayer } from "../state/socket.js";
import { money } from "../lib/format.js";

export function PoolBuilder({
  results,
  selected,
  onSearch,
  onToggle,
  onConfirm,
}: {
  results: CatalogPlayer[];
  selected: string[];
  onSearch: (q: { q?: string; position?: string }) => void;
  onToggle: (id: string) => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const chosen = new Set(selected);

  return (
    <div className="panel pool-builder">
      <div className="panel-head">
        <span className="panel-title">Build the pool</span>
        <span className="mono muted" style={{ fontSize: 12 }}>{selected.length} selected</span>
      </div>

      <input
        className="input"
        placeholder="Search the FC 26 catalog…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onSearch({ q: e.target.value });
        }}
      />

      <div className="builder-results">
        {results.map((r) => {
          const on = chosen.has(r.id);
          return (
            <button
              key={r.id}
              type="button"
              className={`builder-row ${on ? "is-on" : ""}`}
              aria-pressed={on}
              onClick={() => onToggle(r.id)}
            >
              <span className="builder-name">{r.name}</span>
              <span className="pill pill-pos">{r.position}</span>
              <span className="muted builder-club">{r.club}</span>
              <span className="money builder-val">{money(r.value)}</span>
              <span className="builder-mark">{on ? "✓" : "＋"}</span>
            </button>
          );
        })}
        {results.length === 0 && (
          <div className="muted" style={{ fontSize: 13, padding: "10px 2px" }}>
            Search above to add pool players. Leave empty to draft only the five real squads.
          </div>
        )}
      </div>

      <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => onConfirm(selected)}>
        Confirm pool ({selected.length})
      </button>
    </div>
  );
}
