import type { RoomState } from "@fcdn/shared";

export function exportSeasonCsv(s: RoomState): { csv: string; filename: string } {
  const lines: string[] = [];
  lines.push(`# FC Draft Night season ${s.seasonNumber} — code ${s.code}`);
  lines.push("");
  lines.push("## MANAGERS");
  lines.push("managerId,displayName,clubId,reserved,spendable,finishingPosition");
  for (const m of Object.values(s.managers))
    lines.push(`${m.id},${m.displayName},${m.clubId},${m.reserved},${m.spendable},`); // blank to fill
  lines.push("");
  lines.push("## SQUADS");
  lines.push("managerId,playerId,name,position,listedValue");
  for (const p of Object.values(s.players))
    if (p.ownerId) lines.push(`${p.ownerId},${p.id},${p.name},${p.position},${p.listedValue}`);
  lines.push("");
  lines.push("## LOG");
  lines.push("at,type,detail");
  for (const e of s.log) lines.push(`${e.at},${e.t},"${JSON.stringify(e).replace(/"/g, "'")}"`);
  return { csv: lines.join("\n"), filename: `fcdn-season-${s.seasonNumber}-${s.code}.csv` };
}
