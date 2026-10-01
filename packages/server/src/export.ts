import { STANDING_BONUS, type RoomState } from "@fcdn/shared";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";

/**
 * RFC 4180-style CSV field escaping: wrap the field in double quotes if it contains a comma,
 * a double quote, or a newline; double any internal double quotes. Fields with none of those
 * characters are returned as-is (unquoted), matching the previous unescaped format for the
 * common case while making arbitrary user text (e.g. displayName) safe to round-trip.
 */
export function csvEscape(field: string): string {
  if (/[",\n\r]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
  return field;
}

export function exportSeasonCsv(s: RoomState): { csv: string; filename: string } {
  const lines: string[] = [];
  lines.push(`# FC Draft Night season ${s.seasonNumber} — code ${s.code}`);
  lines.push("");
  lines.push("## MANAGERS");
  lines.push("managerId,displayName,clubId,reserved,spendable,finishingPosition");
  for (const m of Object.values(s.managers))
    lines.push(`${csvEscape(m.id)},${csvEscape(m.displayName)},${csvEscape(m.clubId)},${m.reserved},${m.spendable},`); // blank to fill
  lines.push("");
  lines.push("## SQUADS");
  lines.push("managerId,playerId,name,position,listedValue");
  for (const p of Object.values(s.players))
    if (p.ownerId) lines.push(`${csvEscape(p.ownerId)},${csvEscape(p.id)},${csvEscape(p.name)},${csvEscape(p.position)},${p.listedValue}`);
  lines.push("");
  lines.push("## LOG");
  lines.push("at,type,detail");
  for (const e of s.log) lines.push(`${e.at},${e.t},${csvEscape(JSON.stringify(e))}`);
  return { csv: lines.join("\n"), filename: `fcdn-season-${s.seasonNumber}-${s.code}.csv` };
}

/** "arsenal" / "atletico-madrid" -> a readable club name, for clubs the room only knows by id. */
const clubLabel = (s: RoomState, id: string | null): string =>
  (id && s.clubNames[id]) || (id ? id.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "Free Agents");

/**
 * The end-of-season file: a roster CSV in exactly the format the host uploads in Setup, for the NEXT season.
 * Same top lines, a `## TEAMS` section, a `## SQUADS` section with every club's squad as it stands after the
 * draft, and a `## POOL` of everyone still unowned. Upload it again to start the next season.
 *
 * There is no budget in it. Each team's `leftover` is the money it had left at the end of this season, already
 * filled in; from season 2 a club starts with that leftover plus a bonus per league place above last, so the one
 * thing the host adds before uploading is the standings: last season's place for every team (1 = champion).
 * Players FC26 doesn't know keep their value and position through the `value,position` columns.
 */
export function exportRosterCsv(s: RoomState): { csv: string; filename: string } {
  const next = s.seasonNumber + 1;
  const isCustom = (id: string) => id.startsWith("custom-");
  const row = (club: string, p: RoomState["players"][string]): string => {
    const custom = isCustom(p.id);
    return [
      csvEscape(club), csvEscape(p.name), p.shirtNumber ?? "", custom ? "" : csvEscape(p.id), p.overall ?? "",
      custom ? p.listedValue : "", custom ? csvEscape(p.position) : "",
    ].join(",");
  };
  const byValue = (a: { listedValue: number }, b: { listedValue: number }) => b.listedValue - a.listedValue;

  const lines: string[] = [
    `# FC Draft Night — season ${next} roster, exported from room ${s.code}`,
    "# Upload this file in Host Setup to start the next season. Same format as the roster template.",
    "# Before you upload: add the STANDINGS. Fill in finishingPosition for EVERY team below: last season's league",
    "# place, 1 = champion, each number used once. Leave leftover as it is: it is the money the team had left.",
    `# Next season each team starts with its leftover plus ${STANDING_BONUS}M for every place it finished above last.`,
    `tournament,${csvEscape(s.tournamentName ?? "FC Draft Night")}`,
    `season,${next}`,
    "",
    "## TEAMS",
    "club,finishingPosition,leftover",
  ];
  const managers = Object.values(s.managers);
  for (const m of managers) lines.push(`${csvEscape(clubLabel(s, m.clubId))},,${Math.round(Math.max(0, m.spendable) * 10) / 10}`);

  lines.push("", "## SQUADS", "club,player,number,id,score,value,position");
  for (const m of managers)
    for (const p of Object.values(s.players).filter(x => x.ownerId === m.id).sort(byValue)) lines.push(row(clubLabel(s, m.clubId), p));

  const pool = Object.values(s.players).filter(p => !p.ownerId).sort(byValue);
  if (pool.length) {
    lines.push("", "## POOL", "club,player,number,id,score,value,position");
    for (const p of pool) lines.push(row(clubLabel(s, p.homeClub), p));
  }
  return { csv: lines.join("\n") + "\n", filename: `fcdn-season-${next}-roster.csv` };
}

export function exportSeasonXlsx(s: RoomState): Buffer {
  const wb = XLSX.utils.book_new();
  const managers = Object.values(s.managers).map(m => ({ ...m, finishingPosition: "" }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(managers), "Managers");
  const squads = Object.values(s.players).filter(p => p.ownerId).map(p => ({ ownerId: p.ownerId, id: p.id, name: p.name, position: p.position, listedValue: p.listedValue }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(squads), "Squads");
  const log = s.log.map(e => ({ at: e.at, type: e.t, detail: JSON.stringify(e) }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(log), "Log");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function exportSeasonPdf(s: RoomState): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(18).text(`FC Draft Night — Season ${s.seasonNumber}`, { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text("Final Squads");
    for (const m of Object.values(s.managers)) {
      doc.moveDown(0.5).fontSize(12).text(`${m.displayName} (${m.clubId}) — spendable ${m.spendable}`);
      const owned = Object.values(s.players).filter(p => p.ownerId === m.id);
      for (const p of owned) doc.fontSize(10).text(`  ${p.name} (${p.position}) — ${p.listedValue}`);
    }
    doc.end();
  });
}
