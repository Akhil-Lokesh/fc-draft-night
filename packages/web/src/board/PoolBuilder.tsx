import { useState } from "react";
import type { CatalogPlayer } from "../state/socket.js";
import { positionLabel } from "../lib/format.js";
import { Money, Pos, Section } from "../ui/primitives.js";

/** Host-only catalog search: pick extra free agents to throw into the pool. */
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const chosen = new Set(selected);

  // For pinning an exact match in a roster CSV's optional 4th column (see the template).
  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1200);
    } catch { /* no clipboard */ }
  };

  return (
    <Section title="Build the pool" aside={<span className="count">{selected.length} selected</span>}>
      <input
        className="input input-search"
        type="search"
        placeholder="Search the FC 26 catalog…"
        value={q}
        onChange={(e) => { setQ(e.target.value); onSearch({ q: e.target.value }); }}
      />
      <ul className="catalog">
        {results.map((r) => {
          const on = chosen.has(r.id);
          return (
            <li key={r.id} className={`catalog-row ${on ? "is-on" : ""}`}>
              <button type="button" className="catalog-toggle" aria-pressed={on} onClick={() => onToggle(r.id)}>
                <span className="catalog-tick" aria-hidden="true">{on ? "✓" : "+"}</span>
                <span className="catalog-name">{r.name}<small>{r.club}</small></span>
                <Pos>{positionLabel(r)}</Pos>
                <Money n={r.value} />
              </button>
              <button
                type="button"
                className="catalog-id"
                title="Copy this player's catalog id — pin it in a roster CSV's optional 4th column"
                onClick={() => copyId(r.id)}
              >
                {copiedId === r.id ? "copied ✓" : `id ${r.id}`}
              </button>
            </li>
          );
        })}
      </ul>
      {results.length === 0 && (
        <p className="empty">Search to add pool players, or leave it empty to draft only the real squads.</p>
      )}
      <button className="btn btn-chalk btn-block" onClick={() => onConfirm(selected)}>
        Confirm pool ({selected.length})
      </button>
    </Section>
  );
}
