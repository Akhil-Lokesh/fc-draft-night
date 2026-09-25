import type { Player } from "@fcdn/shared";
import { benchOf, chooseFormation, layoutSquad } from "../lib/formation.js";
import { Money } from "../ui/primitives.js";

/** Best-fit XI on a chalk-lined pitch, with the bench underneath. */
export function Pitch({ players }: { players: Player[] }) {
  const placed = layoutSquad(players);
  const bench = benchOf(players);
  return (
    <div className="pitch-wrap">
      <div className="pitch-formation">{chooseFormation(players)}</div>
      <div className="pitch-field">
        <svg className="pitch-lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
          <rect x="3" y="3" width="94" height="134" />
          <line x1="3" y1="70" x2="97" y2="70" />
          <circle cx="50" cy="70" r="12" />
          <rect x="22" y="3" width="56" height="20" />
          <rect x="36" y="3" width="28" height="7" />
          <rect x="22" y="117" width="56" height="20" />
          <rect x="36" y="130" width="28" height="7" />
        </svg>
        {placed.map(({ player, x, y, code }) => (
          <div key={player.id} className="pp" style={{ left: `${x}%`, top: `${y}%` }}>
            <span className="pp-shirt">{player.shirtNumber ?? code}</span>
            <span className="pp-name">{player.name}</span>
            <Money n={player.listedValue} className="pp-val" />
          </div>
        ))}
      </div>
      {bench.length > 0 && (
        <div className="bench">
          <h4 className="band-title">Bench &amp; reserves</h4>
          <ul className="bench-list">
            {bench.map((p) => <li key={p.id}>{p.name} <Money n={p.listedValue} /></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
