// Ingest the EA FC 26 player database CSV into normalized app data.
// Source: FC 26 (fifa_version 26, update 19-09-2025), sofifa-style schema.
// Raw CSV download (18,405 players):
//   https://raw.githubusercontent.com/Peritosh/FC_26_Analysis_Report/main/FC26_Dataset.csv
//
// Outputs:
//   packages/server/src/data/fc26-catalog.json  — every player (host's pool-pick universe + search)
//   packages/shared/src/data/seed/squads.json    — the 5 club starting squads only (light)
//
// Usage: node scripts/ingest-fc26.mjs <path-to-FC26_Dataset.csv>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const CSV = process.argv[2] ?? "peritosh.csv";

const POS = {
  GK: "GK",
  CB: "DEF", RB: "DEF", LB: "DEF", RWB: "DEF", LWB: "DEF",
  CDM: "MID", CM: "MID", CAM: "MID", RM: "MID", LM: "MID",
  ST: "FWD", CF: "FWD", RW: "FWD", LW: "FWD",
};
const CLUB = {
  "Real Madrid": "real",
  "FC Barcelona": "barca",
  "FC Bayern München": "bayern",
  "Arsenal": "arsenal",
  "Manchester City": "city",
};

// Minimal RFC-4180-ish CSV parser (handles quoted fields with commas/quotes).
function parseCsv(text) {
  const rows = [];
  let field = "", row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const raw = readFileSync(CSV, "utf-8");
const [header, ...lines] = parseCsv(raw);
const col = Object.fromEntries(header.map((h, i) => [h, i]));

// Dedupe by player_id, keeping the latest fifa_update.
const byId = new Map();
for (const r of lines) {
  const id = r[col.player_id];
  if (!id) continue;
  const upd = Number(r[col.fifa_update] ?? 0);
  const prev = byId.get(id);
  if (!prev || upd > prev.upd) byId.set(id, { r, upd });
}

const catalog = [];
for (const { r } of byId.values()) {
  const primary = (r[col.player_positions] || "").split(",")[0].trim();
  const position = POS[primary] ?? "MID";
  const club = r[col.club_name] || "";
  const clubId = CLUB[club] ?? null;
  const valueEur = Number(r[col.value_eur] || 0);
  catalog.push({
    id: String(r[col.player_id]),
    name: (r[col.short_name] || r[col.long_name] || "Unknown").trim(),
    position,
    value: Math.round((valueEur / 1e6) * 10) / 10, // €M, 1 decimal
    overall: Number(r[col.overall] || 0),
    club,
    clubId,
  });
}
catalog.sort((a, b) => b.value - a.value);

const squads = catalog.filter((p) => p.clubId);

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 0));
}
write("packages/server/src/data/fc26-catalog.json", catalog);
write("packages/shared/src/data/seed/squads.json", squads);

// Report
const clubs = ["real", "barca", "bayern", "arsenal", "city"];
const totals = Object.fromEntries(clubs.map((c) => {
  const sq = squads.filter((p) => p.clubId === c);
  return [c, { n: sq.length, valueM: Math.round(sq.reduce((s, p) => s + p.value, 0)) }];
}));
const priciest = Math.max(...clubs.map((c) => totals[c].valueM));
console.log("catalog players:", catalog.length);
console.log("squads:", JSON.stringify(totals, null, 2));
console.log("priciest squad €M:", priciest, "=> floor:", Math.ceil(priciest / 100) * 100);
console.log("pool universe (non-club):", catalog.length - squads.length);
