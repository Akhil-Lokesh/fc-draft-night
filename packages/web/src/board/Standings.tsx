import type { Manager } from "@fcdn/shared";
import { CHALLENGE_CAP } from "../lib/board.js";
import { useClubLabel } from "../lib/clubs.js";
import { Crest, Money, useClubVars } from "../ui/primitives.js";
import { VoiceRing } from "./Voice.js";

const LOW = 0.12; // share of the total budget below which a manager reads as running low

/** League-table view of the room: who has money left, and how many of my challenges against
 *  each rival I've already burned. */
export function Standings({
  managers,
  totalBudget,
  myId,
  challenges,
}: {
  managers: Record<string, Manager>;
  totalBudget: number;
  myId: string;
  challenges: Record<string, number>;
}) {
  const label = useClubLabel();
  const clubVars = useClubVars();
  const rows = Object.values(managers).sort((a, b) => b.spendable - a.spendable);

  return (
    <table className="table">
      <thead>
        <tr><th>#</th><th>Club</th><th className="num">Left</th><th className="num" title="Your challenges used against them">Chal.</th></tr>
      </thead>
      <tbody>
        {rows.map((m, i) => {
          const frac = totalBudget > 0 ? Math.max(0, Math.min(1, m.spendable / totalBudget)) : 0;
          const low = m.spendable <= totalBudget * LOW;
          const me = m.id === myId;
          const used = challenges[`${myId}->${m.id}`] ?? 0;
          return (
            <tr key={m.id} className={me ? "is-me" : ""} style={clubVars(m.clubId)}>
              <td className="pos-no">{i + 1}</td>
              <td>
                <div className="t-club">
                  <VoiceRing managerId={m.id}><Crest clubId={m.clubId} size={20} /></VoiceRing>
                  <span className="t-names">
                    <b>{m.displayName}{me ? " (you)" : ""}</b>
                    <small>{label(m.clubId)}</small>
                  </span>
                </div>
                <div className="t-bar"><i className={low ? "is-low" : ""} style={{ width: `${frac * 100}%` }} /></div>
              </td>
              <td className={`num ${low ? "is-low" : ""}`}><Money n={m.spendable} /></td>
              <td className="num">
                {me ? <span className="dim">–</span> : (
                  <span className={`pips ${used >= CHALLENGE_CAP ? "is-max" : ""}`} aria-label={`${used} of ${CHALLENGE_CAP} challenges used`}>
                    {Array.from({ length: CHALLENGE_CAP }, (_, k) => <i key={k} className={k < used ? "spent" : ""} />)}
                    <span className="pips-n">{used}/{CHALLENGE_CAP}</span>
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
