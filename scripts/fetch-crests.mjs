// Fetch club crests for the top 50 FC26 clubs (ranked by total squad value in the catalog) from
// TheSportsDB's free API, and save them inside the web app so they're served locally — no
// hotlinking, and they still show on a LAN game night with no internet.
//
// Outputs:
//   packages/web/public/crests/<slug>.png   — one 250px badge per club
//   packages/web/src/lib/crests.json        — lookup: name key -> file slug (see crestKey)
//
// Clubs outside the top 50 keep the lettered shield. Crests are the clubs' trademarks; this is
// for a private game night, not redistribution.
//
// Usage: node scripts/fetch-crests.mjs [count=50]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const COUNT = Number(process.argv[2] ?? 50);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = `${ROOT}packages/web/public/crests`;
const MANIFEST = `${ROOT}packages/web/src/lib/crests.json`;
const API = "https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=";
const LOOKUP = "https://www.thesportsdb.com/api/v1/json/3/lookupteam.php?id=";

// FC26 spells some clubs differently from how TheSportsDB (and most people) do — search these.
// "#<id>" looks a team up by TheSportsDB id instead, for clubs the name search can't find.
const SEARCH_AS = {
  "FC Bayern München": ["Bayern Munich"],
  "Inter": ["Inter Milan", "Internazionale"],
  "Athletic Club": ["Athletic Bilbao"],
  "Roma": ["AS Roma"],
  "Bayer 04 Leverkusen": ["Bayer Leverkusen"],
  "Galatasaray SK": ["Galatasaray"],
  "Olympique de Marseille": ["Marseille"],
  "SL Benfica": ["Benfica"],
  "Villarreal CF": ["Villarreal"],
  "Fenerbahçe SK": ["Fenerbahce"],
  "Real Betis Balompié": ["Real Betis"],
  "AFC Bournemouth": ["Bournemouth"],
  "PSV": ["PSV Eindhoven"],
  "Valencia CF": ["Valencia"],
  "Fulham FC": ["Fulham"],
  "Atlético Madrid": ["Atletico Madrid"],
  "FC Barcelona": ["Barcelona"],
  "Al Hilal": ["Al Hilal SFC"], // plain "Al Hilal" finds Al Hilal Wau (South Sudan)
  "Brighton & Hove Albion": ["Brighton and Hove Albion"], // "Brighton" finds the women's team
  "Sporting CP": ["Sporting CP", "Sporting Lisbon"],
  "Paris Saint-Germain": ["Paris Saint Germain"], // "Paris SG" finds Torcy
  "Tottenham Hotspur": ["Tottenham Hotspur"],
  "Newcastle United": ["Newcastle United"], // "Newcastle" finds Newcastle Jets
  "Manchester United": ["Manchester United"],
  "Nottingham Forest": ["#133720"], // name search finds nothing; TheSportsDB team id
  "RB Leipzig": ["RB Leipzig"],
  "Eintracht Frankfurt": ["Eintracht Frankfurt"],
  "VfB Stuttgart": ["Stuttgart"],
  "VfL Wolfsburg": ["Wolfsburg"],
  "West Ham United": ["West Ham United"],
  "AS Monaco": ["Monaco"],
  "FC Porto": ["Porto", "FC Porto"],
  "AC Milan": ["AC Milan", "Milan"],
  "Lazio": ["Lazio"],
};

// The five built-in clubs use short ids in rooms.
const BUILTIN = { "Real Madrid": "real", "Arsenal": "arsenal", "FC Barcelona": "barca", "Manchester City": "city", "FC Bayern München": "bayern" };

// Keep in sync with crestKey in packages/web/src/lib/crests.ts.
const GENERIC = new Set(["fc", "cf", "sc", "afc", "ac", "as", "sl", "sk", "rc", "cd", "ssc", "club", "de", "balompie", "calcio", "the", "vfl", "vfb", "04", "1"]);
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[øØ]/g, "o").replace(/ß/g, "ss").toLowerCase();
const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const crestKey = (s) => slug(s).split("-").filter((t) => t && !GENERIC.has(t)).join("-");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(q) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(q.startsWith("#") ? LOOKUP + q.slice(1) : API + encodeURIComponent(q));
    if (res.status === 429) { await sleep(20_000); continue; }
    if (!res.ok) return [];
    const body = await res.json().catch(() => ({}));
    return (body.teams ?? []).filter((t) => t.strSport === "Soccer" && !/women|wfc|femen|fémin|u2\d|u1\d|\bII\b|\bB\b$/i.test(t.strTeam));
  }
  return [];
}

async function main() {
  const catalog = JSON.parse(readFileSync(`${ROOT}packages/server/src/data/fc26-catalog.json`, "utf8"));
  const value = new Map();
  for (const p of catalog) if (p.club) value.set(p.club, (value.get(p.club) ?? 0) + p.value);
  const top = [...value.entries()].sort((a, b) => b[1] - a[1]).slice(0, COUNT).map(([c]) => c);

  mkdirSync(OUT_DIR, { recursive: true });
  // key -> every file that claimed it. A key two clubs share (e.g. "milan") matches neither.
  const claims = new Map();
  const claim = (key, file) => {
    if (!key || key.length < 3 || GENERIC.has(key)) return; // "", "afc", "fc"… would match anyone
    (claims.get(key) ?? claims.set(key, new Set()).get(key)).add(file);
  };
  const missed = [];
  for (const [i, club] of top.entries()) {
    let team;
    for (const q of SEARCH_AS[club] ?? [club]) {
      const hits = await search(q);
      await sleep(2200); // free key: stay well under the rate limit
      team = hits.find((t) => t.strBadge) ;
      if (team) break;
    }
    if (!team) { missed.push(club); console.log(`${i + 1}. ${club}: NOT FOUND`); continue; }

    const file = slug(club);
    const img = await fetch(`${team.strBadge}/small`);
    if (!img.ok) { missed.push(club); console.log(`${i + 1}. ${club}: badge download ${img.status}`); continue; }
    writeFileSync(`${OUT_DIR}/${file}.png`, Buffer.from(await img.arrayBuffer()));

    // Every spelling a room might use for this club points at the same file.
    const names = [club, team.strTeam, ...(team.strTeamAlternate ?? "").split(","), ...(SEARCH_AS[club] ?? []).filter((q) => !q.startsWith("#"))]
      .map((n) => n.trim()).filter(Boolean);
    for (const n of names) for (const k of [slug(n), crestKey(n)]) claim(k, file);
    if (BUILTIN[club]) claim(BUILTIN[club], file);
    console.log(`${i + 1}. ${club} -> ${team.strTeam} (${file}.png)`);
  }

  const sorted = Object.fromEntries(
    [...claims.entries()].filter(([, files]) => files.size === 1).map(([k, files]) => [k, [...files][0]])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`\n${top.length - missed.length}/${top.length} crests saved.${missed.length ? " Missed: " + missed.join(", ") : ""}`);
}

main();
