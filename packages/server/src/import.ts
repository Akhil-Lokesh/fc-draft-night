/**
 * Parses a single CSV row (RFC 4180-ish) into its fields, respecting double-quoted fields that
 * may contain commas, doubled double-quotes (`""` -> `"`), and embedded newlines are not
 * supported here since callers operate line-by-line — but quoted commas/quotes within a single
 * line are handled correctly, unlike a naive `line.split(",")`.
 */
export function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } // doubled quote -> literal quote
        else inQuotes = false; // closing quote
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { cols.push(field); field = ""; }
      else field += ch;
    }
  }
  cols.push(field);
  return cols;
}

/** Finishing order (worst first, manager ids) from the `## TEAMS` section of an upload-format roster file —
 *  what the season export produces once the host has filled in each team's place. `managerOf` turns a club
 *  name into the room's manager for that club. */
export function parseTeamsFinishingOrder(csv: string, managerOf: (club: string) => string | undefined): string[] {
  const lines = csv.split(/\r?\n/);
  const start = lines.findIndex(l => /^##\s*TEAMS\s*$/i.test(l.trim()));
  if (start < 0) throw new Error("TEAMS section not found");
  const rows: { id: string; pos: number }[] = [];
  let seenHeader = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith("##")) break;
    if (!line || line.startsWith("#")) continue;
    if (!seenHeader) { seenHeader = true; continue; } // club,finishingPosition
    const [club, posRaw] = parseCsvLine(line);
    const id = club ? managerOf(club.trim()) : undefined;
    if (!id) throw new Error(`team "${club ?? ""}" is not in this room`);
    const pos = Number((posRaw ?? "").trim());
    if (!Number.isInteger(pos) || pos < 1) throw new Error(`bad finishing position for ${club}`);
    rows.push({ id, pos });
  }
  const positions = rows.map(r => r.pos);
  if (new Set(positions).size !== positions.length) throw new Error("duplicate finishing position");
  return rows.sort((a, b) => b.pos - a.pos).map(r => r.id);
}

export function parseFinishingOrder(csv: string): string[] {
  const lines = csv.split(/\r?\n/);
  const start = lines.findIndex(l => l.startsWith("managerId,displayName"));
  if (start < 0) throw new Error("managers section not found");
  const rows: { id: string; pos: number }[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || !line.trim() || line.startsWith("#")) break;
    const cols = parseCsvLine(line);
    const id = cols[0];
    const posRaw = cols[5];
    if (!id || posRaw === undefined) throw new Error(`bad finishing position for ${id ?? "<unknown>"}`);
    const pos = Number(posRaw);
    if (!Number.isInteger(pos) || pos < 1) throw new Error(`bad finishing position for ${id}`);
    rows.push({ id, pos });
  }
  const positions = rows.map(r => r.pos);
  if (new Set(positions).size !== positions.length) throw new Error("duplicate finishing position");
  return rows.sort((a, b) => b.pos - a.pos).map(r => r.id); // worst (highest number) first
}
