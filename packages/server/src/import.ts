export function parseFinishingOrder(csv: string): string[] {
  const lines = csv.split(/\r?\n/);
  const start = lines.findIndex(l => l.startsWith("managerId,displayName"));
  if (start < 0) throw new Error("managers section not found");
  const rows: { id: string; pos: number }[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || !line.trim() || line.startsWith("#")) break;
    const cols = line.split(",");
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
