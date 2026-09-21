import type { Manager } from "@fcdn/shared";
import { money } from "../lib/format.js";
import { clubClass } from "../lib/clubs.js";

const LOW = 0.12; // fraction of total budget below which a manager reads as "running low"

export function BudgetBars({
  managers,
  totalBudget,
  myId,
}: {
  managers: Record<string, Manager>;
  totalBudget: number;
  myId?: string;
}) {
  const rows = Object.values(managers).sort((a, b) => b.spendable - a.spendable);
  return (
    <div className="budget-bars">
      {rows.map((m) => {
        const frac = totalBudget > 0 ? Math.max(0, Math.min(1, m.spendable / totalBudget)) : 0;
        const low = m.spendable <= totalBudget * LOW;
        return (
          <div key={m.id} className={`budget-row ${m.id === myId ? "is-me" : ""}`}>
            <div className="budget-head">
              <span className={`club-chip ${clubClass(m.clubId)}`}>{m.displayName}</span>
              <span className={`money budget-amt ${low ? "is-low" : ""}`}>{money(m.spendable)}</span>
            </div>
            <div className="bar">
              <div
                className={`bar-fill ${clubClass(m.clubId)} ${low ? "is-low" : ""}`}
                style={{ width: `${frac * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
