// Merge exact FC positions (ST, CB, CDM, RW, ...) and playstyle tags (#Speedster, #Dribbler, ...)
// into the existing catalog/seed data. The main ingest (ingest-fc26.mjs) only keeps a 4-bucket
// position (GK/DEF/MID/FWD) for budget/business logic. This adds `positionDetail` — the real
// slot, needed to place a squad on a pitch for the post-draft ground view — and `tags`, shown
// on the player-card confirm step before challenging/listing. Source: the same raw FC26 dataset
// CSV that built the catalog (player_id space matches 1:1).
//
// Usage: node scripts/merge-positions.mjs [path-to-FC26_Dataset.csv]
import { readFileSync, writeFileSync } from "node:fs";

const CSV = process.argv[2] ?? "FC26_20250921.csv";

// Minimal RFC-4180-ish CSV parser (handles quoted fields with commas/quotes) — same as ingest-fc26.mjs.
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

const positionsById = new Map(); // id -> [primary, ...alternates], e.g. Mbappé: ["ST","LW","LM"]
const tagsById = new Map(); // id -> ["Speedster","Dribbler",...], e.g. Mbappé's archetype tags
for (const r of lines) {
  const id = r[col.player_id];
  const all = (r[col.player_positions] || "").split(",").map(s => s.trim()).filter(Boolean);
  if (id && all.length) positionsById.set(id, all);
  const tags = (r[col.player_tags] || "").split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean);
  if (id && tags.length) tagsById.set(id, tags);
}

// Fallback when a catalog player has no match in the richer source (shouldn't happen given the
// two files share the same player_id space, but keeps the merge total).
const FALLBACK = { GK: "GK", DEF: "CB", MID: "CM", FWD: "ST" };

function mergeInto(path) {
  const data = JSON.parse(readFileSync(path, "utf-8"));
  let matched = 0;
  const merged = data.map(p => {
    const all = positionsById.get(p.id);
    if (all) matched++;
    const [primary, ...alts] = all ?? [FALLBACK[p.position] ?? "CM"];
    const tags = tagsById.get(p.id);
    return { ...p, positionDetail: primary, altPositions: alts.length ? alts : undefined, tags };
  });
  writeFileSync(path, JSON.stringify(merged, null, 0));
  console.log(`${path}: ${matched}/${data.length} matched exact positions`);
}

mergeInto("packages/server/src/data/fc26-catalog.json");
mergeInto("packages/shared/src/data/seed/squads.json");
