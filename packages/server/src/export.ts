import type { RoomState } from "@fcdn/shared";
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
