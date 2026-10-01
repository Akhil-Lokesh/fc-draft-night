import type { Position, SeedPlayer } from "@fcdn/shared";
import { parseCsvLine } from "./import.js";
import { slugifyClub, normalizeForMatch } from "./clubs.js";

interface ClubStats { avgValue: number; avgOverall: number; commonPosition: Position }

/** Last whitespace token of a normalized name — a stable stand-in for "surname" whether the
 *  name is "K. Mbappé" or "Kylian Mbappé" (EA's catalog favors the initial-dot short form, but
 *  nobody types a roster that way). */
function surnameKey(name: string): string {
  const tokens = normalizeForMatch(name).split(" ").filter(Boolean);
  return tokens.at(-1) ?? "";
}
/** First letter of the first token — cheap sanity check alongside `surnameKey` so common
 *  surnames (e.g. "Silva") don't collapse two unrelated players into one match. */
function firstInitial(name: string): string {
  return normalizeForMatch(name).split(" ").filter(Boolean)[0]?.[0] ?? "";
}

/** A club name stripped of the filler words people drop or add ("Atlético de Madrid" / "Atlético Madrid" /
 *  "Club Atlético Madrid", "FC Barcelona" / "Barcelona"), for the looser club test of the third try. */
const CLUB_FILLER = new Set(["de", "fc", "cf", "afc", "club", "the"]);
function looseClubKey(club: string): string {
  return normalizeForMatch(club).split(" ").filter(t => t && !CLUB_FILLER.has(t)).join(" ");
}

interface CatalogIndex {
  /** catalog player id -> player, for a CSV row that names the exact FC26 id — bypasses name
   *  matching entirely, so there's no ambiguity risk (e.g. two "J. Silva"s, or a display name
   *  the matcher doesn't recognize at all). */
  byId: Map<string, SeedPlayer>;
  /** "club|name" -> player, for the common case where the CSV's club still matches the database. */
  byClubAndName: Map<string, SeedPlayer>;
  /** name -> every catalog entry with that name, for players who've since transferred — the
   *  CSV's club doesn't need to match the database's club at all, since squads change. */
  byName: Map<string, SeedPlayer[]>;
  /** "surname" -> every catalog entry ending in that surname, regardless of how much of the
   *  first name (or just an initial) precedes it — see `surnameKey`. */
  bySurname: Map<string, SeedPlayer[]>;
  /** "looseClub|shirt number" -> every catalog entry wearing that number at that club, for the third try
   *  (number + score) when neither the id nor the name found anybody. */
  byClubNumber: Map<string, SeedPlayer[]>;
  /** normalized club name -> canonical spelling, so a loosely-typed club still displays nicely. */
  clubSpelling: Map<string, string>;
  /** normalized club name -> that club's average stats, for a player the database has never
   *  heard of at all (typo, lower-league signing, etc.) — still needs SOME reasonable numbers. */
  clubStats: Map<string, ClubStats>;
  /** Same, but averaged over the whole database — the last resort when even the stated club
   *  is unknown to it. */
  globalStats: ClubStats;
}

function statsOf(players: SeedPlayer[]): ClubStats {
  const avgValue = players.reduce((s, p) => s + p.value, 0) / players.length;
  const avgOverall = players.reduce((s, p) => s + p.overall, 0) / players.length;
  const counts = new Map<Position, number>();
  for (const p of players) counts.set(p.position, (counts.get(p.position) ?? 0) + 1);
  const commonPosition = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  return { avgValue: Math.round(avgValue * 10) / 10, avgOverall: Math.round(avgOverall), commonPosition };
}

function buildIndex(catalog: SeedPlayer[]): CatalogIndex {
  const byId = new Map<string, SeedPlayer>();
  const byClubAndName = new Map<string, SeedPlayer>();
  const byName = new Map<string, SeedPlayer[]>();
  const bySurname = new Map<string, SeedPlayer[]>();
  const clubSpelling = new Map<string, string>();
  const byClub = new Map<string, SeedPlayer[]>();
  const byClubNumber = new Map<string, SeedPlayer[]>();
  for (const p of catalog) {
    byId.set(p.id, p);
    byClubAndName.set(`${normalizeForMatch(p.club)}|${normalizeForMatch(p.name)}`, p);
    const nameKey = normalizeForMatch(p.name);
    (byName.get(nameKey) ?? byName.set(nameKey, []).get(nameKey)!).push(p);
    const surname = surnameKey(p.name);
    (bySurname.get(surname) ?? bySurname.set(surname, []).get(surname)!).push(p);
    const clubKey = normalizeForMatch(p.club);
    clubSpelling.set(clubKey, p.club);
    (byClub.get(clubKey) ?? byClub.set(clubKey, []).get(clubKey)!).push(p);
    if (p.clubNumber !== undefined) {
      const numKey = `${looseClubKey(p.club)}|${p.clubNumber}`;
      (byClubNumber.get(numKey) ?? byClubNumber.set(numKey, []).get(numKey)!).push(p);
    }
  }
  const clubStats = new Map<string, ClubStats>();
  for (const [clubKey, players] of byClub) clubStats.set(clubKey, statsOf(players));
  const globalStats = statsOf(catalog);
  return { byId, byClubAndName, byName, bySurname, byClubNumber, clubSpelling, clubStats, globalStats };
}

/** What a player the database has never heard of is worth (€M) and how he's rated. These are reserve and
 *  academy players the game's snapshot lacks, so they start cheap. They used to get their club's AVERAGE
 *  value, which made six unknown Real Madrid reserves worth ~285M and pushed a real ~1411M squad over a
 *  1500M budget. The host can set a real value and position in the CSV's 5th/6th columns. */
export const UNKNOWN_PLAYER_VALUE = 0.5;
export const UNKNOWN_PLAYER_OVERALL = 55;

/** A player the database has never heard of at all — still gets seeded: cheap and unrated, playing the
 *  position most of his club's squad plays (or the whole database's, if even that club is unknown). */
function syntheticPlayer(index: CatalogIndex, clubRaw: string, playerRaw: string): SeedPlayer {
  const stats = index.clubStats.get(normalizeForMatch(clubRaw)) ?? index.globalStats;
  const name = playerRaw.trim();
  return {
    id: `custom-${slugifyClub(clubRaw)}-${slugifyClub(name)}`,
    name, position: stats.commonPosition, value: UNKNOWN_PLAYER_VALUE, overall: UNKNOWN_PLAYER_OVERALL,
    club: clubRaw.trim(), clubId: null,
  };
}

/** Narrows a multi-candidate match down to one: prefer whoever's database club loosely matches
 *  what the host typed; otherwise just take the highest-value one. Never blocks the upload. */
function resolveCandidates(candidates: SeedPlayer[], clubRaw: string, score?: number): SeedPlayer {
  if (candidates.length === 1) return candidates[0]!;
  // A score is the most specific hint there is: if exactly the same-named players differ in rating, it names one.
  if (score !== undefined) {
    const sameRating = candidates.filter(c => c.overall === score);
    if (sameRating.length === 1) return sameRating[0]!;
    if (sameRating.length > 1) candidates = sameRating;
  }
  const clubNorm = normalizeForMatch(clubRaw);
  const loose = candidates.filter(c => {
    const candidateClubNorm = normalizeForMatch(c.club);
    return candidateClubNorm.includes(clubNorm) || clubNorm.includes(candidateClubNorm);
  });
  if (loose.length === 1) return loose[0]!;
  const pool = loose.length > 1 ? loose : candidates;
  return pool.reduce((best, c) => (c.value > best.value ? c : best));
}

/**
 * Finds the player behind a CSV row by NAME alone — the CSV's club is never required to agree
 * with the database's (players transfer). When a name matches more than one real player, prefer
 * one whose database club loosely matches what the host typed; otherwise just take the highest-
 * value one. When no exact name matches, fall back to surname + first-initial — the database
 * favors EA's short display name ("K. Mbappé"), but a hand-typed roster naturally uses the full
 * first name ("Kylian Mbappé"), and without this fallback most famous players would silently
 * miss the database. When the database has never heard of the name at all (either way), don't
 * block the upload either — seed them with their stated club's average stats instead.
 */
function findPlayer(index: CatalogIndex, clubRaw: string, playerRaw: string, score?: number, shirtNumber?: number): SeedPlayer {
  const candidates = index.byName.get(normalizeForMatch(playerRaw));
  // A score naming exactly one of several same-named players beats even an exact club match: players
  // transfer, but a rating of 76 is never the 90-rated namesake.
  if (score !== undefined && candidates && candidates.length > 1) {
    const sameRating = candidates.filter(c => c.overall === score);
    if (sameRating.length > 0) return resolveCandidates(sameRating, clubRaw, score);
  }

  const exact = index.byClubAndName.get(`${normalizeForMatch(clubRaw)}|${normalizeForMatch(playerRaw)}`);
  if (exact) return exact;

  if (candidates && candidates.length > 0) return resolveCandidates(candidates, clubRaw, score);

  // A mononym catalog entry ("Carvajal", no initial at all) has nothing to compare against the
  // query's first-initial — surname agreement alone is enough for those.
  const surnameCandidates = (index.bySurname.get(surnameKey(playerRaw)) ?? [])
    .filter(c => normalizeForMatch(c.name).split(" ").filter(Boolean).length === 1
      || firstInitial(c.name) === firstInitial(playerRaw));
  if (surnameCandidates.length > 0) return resolveCandidates(surnameCandidates, clubRaw, score);

  // Third try, for a name the database doesn't know (a first name alone, a nickname): same club, same shirt
  // number AND same rating. Both are needed, and only a single fit counts — two fits is a guess.
  if (shirtNumber !== undefined && score !== undefined) {
    const fits = (index.byClubNumber.get(`${looseClubKey(clubRaw)}|${shirtNumber}`) ?? []).filter(c => c.overall === score);
    if (fits.length === 1) return fits[0]!;
  }

  return syntheticPlayer(index, clubRaw, playerRaw);
}

const KNOWN_POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

type Col = "club" | "player" | "number" | "id" | "score" | "value" | "position";
const COLUMN_NAMES: Record<string, Col> = {
  club: "club", player: "player", name: "player", number: "number", no: "number", shirt: "number",
  id: "id", score: "score", overall: "score", rating: "score", value: "value", position: "position", pos: "position",
};
/** Where each column sits in the file's rows. Files that name their extra columns (id, score, value,
 *  position) in the header are read by name, in any order, and only the columns named are used. Older files
 *  with a plain `club,player[,number]` header and unnamed extras keep the original positions: id, value,
 *  position, then score. */
const LEGACY_COLUMNS: Record<Col, number> = { club: 0, player: 1, number: 2, id: 3, value: 4, position: 5, score: 6 };
function columnsFrom(header: string): Record<Col, number> {
  const named: Partial<Record<Col, number>> = {};
  parseCsvLine(header).forEach((h, i) => {
    const col = COLUMN_NAMES[normalizeForMatch(h)];
    if (col && named[col] === undefined) named[col] = i;
  });
  const usesNames = (["id", "score", "value", "position"] as Col[]).some(c => named[c] !== undefined);
  if (!usesNames) return { ...LEGACY_COLUMNS };
  return {
    club: named.club ?? 0, player: named.player ?? 1,
    number: named.number ?? -1, id: named.id ?? -1, score: named.score ?? -1, value: named.value ?? -1, position: named.position ?? -1,
  };
}

/** Parses `club,player[,number[,id[,value[,position]]]]` data rows out of `lines` (index 0 is
 *  that block's own header row, so labeling starts at 2 — matches how these errors have always
 *  been numbered). The CSV's club is authoritative for team assignment (canonicalized to the
 *  database's spelling when that club is known); the database is only used to verify the player
 *  is real and pull their stats. A row's optional 4th column is the exact FC26 catalog id (as
 *  `searchCatalog` results carry it) — when given AND it matches, it's used directly instead of
 *  by name, so there's no ambiguity risk. An id the catalog doesn't recognize (a typo, or — as
 *  happened with a real upload — a whole column of ids sourced from a different/bigger database
 *  than this app's) quietly falls back to matching by name instead, exactly as if the cell were
 *  left blank: never blocks the upload over it.
 *
 *  Optional 5th/6th columns (`value` in €M, `position` GK/DEF/MID/FWD) hand-supply real stats
 *  for a player the database genuinely has never heard of at all — e.g. a real, current squad
 *  member who's simply too new/obscure for the game's roster snapshot to include (verified: not
 *  a bug, not a made-up name, just the game's database predating the player's rise). They're
 *  used ONLY when neither the id nor the name resolved to a real catalog player — a real match
 *  always wins over a manual override, never the other way round. */
function parseClubPlayerRows(lines: string[], index: CatalogIndex, rowLabelPrefix: string): SeedPlayer[] {
  const seed: SeedPlayer[] = [];
  const errors: string[] = [];
  const cols = columnsFrom(lines[0]!);
  for (let i = 1; i < lines.length; i++) {
    const rowLabel = `${rowLabelPrefix} ${i + 1}`;
    const cells = parseCsvLine(lines[i]!);
    const cell = (c: Col): string | undefined => (cols[c] >= 0 ? cells[cols[c]] : undefined);
    const clubRaw = cell("club"), playerRaw = cell("player"), numberRaw = cell("number");
    const idRaw = cell("id"), valueRaw = cell("value"), positionRaw = cell("position"), scoreRaw = cell("score");
    if (!clubRaw || !playerRaw) { errors.push(`${rowLabel}: missing club or player`); continue; }

    // The score (FC26 overall rating, 1-99) names one of several same-named players, and rates a player
    // the database has never heard of.
    let score: number | undefined;
    if (scoreRaw && scoreRaw.trim()) {
      const n = Number(scoreRaw.trim());
      if (!Number.isInteger(n) || n < 1 || n > 99) { errors.push(`${rowLabel}: bad score "${scoreRaw.trim()}" (a whole number from 1 to 99)`); continue; }
      score = n;
    }

    let shirtNumber: number | undefined;
    if (numberRaw && numberRaw.trim()) {
      const n = Number(numberRaw.trim());
      if (!Number.isInteger(n) || n < 1) { errors.push(`${rowLabel}: bad shirt number "${numberRaw.trim()}"`); continue; }
      shirtNumber = n;
    }

    const byId = idRaw && idRaw.trim() ? index.byId.get(idRaw.trim()) : undefined;
    const match = byId ?? findPlayer(index, clubRaw, playerRaw, score, shirtNumber);
    const club = index.clubSpelling.get(normalizeForMatch(clubRaw)) ?? clubRaw.trim();
    const clubId = slugifyClub(club);

    let value = match.value;
    let position = match.position;
    const isSynthetic = match.id.startsWith("custom-");
    if (isSynthetic && valueRaw && valueRaw.trim()) {
      const v = Number(valueRaw.trim());
      if (!Number.isFinite(v) || v <= 0) { errors.push(`${rowLabel}: bad value "${valueRaw.trim()}"`); continue; }
      value = v;
    }
    if (isSynthetic && positionRaw && positionRaw.trim()) {
      const pos = positionRaw.trim().toUpperCase() as Position;
      if (!KNOWN_POSITIONS.includes(pos)) {
        errors.push(`${rowLabel}: bad position "${positionRaw.trim()}" (must be GK, DEF, MID or FWD)`);
        continue;
      }
      position = pos;
    }

    seed.push({ ...match, value, position, overall: isSynthetic && score !== undefined ? score : match.overall, club, clubId, shirtNumber });
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return seed;
}

/**
 * Parses a host-uploaded roster CSV (`club,player[,number[,id[,value[,position]]]]` rows) and
 * cross-checks every player against the FC26 database (any club — players transfer, so the
 * CSV's club is never required to match the database's), since a competitive draft's economy
 * depends on real, verified stats — not whatever numbers a host might type. A real catalog match
 * (by id or name) always wins; `value`/`position` only ever apply when nothing real was found at
 * all. Returns the room's initial seed: real stats from the database, club/team from the CSV.
 */
export function parseRosterCsv(csv: string, catalog: SeedPlayer[]): SeedPlayer[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  const header = lines[0];
  if (!header || !/^club\s*,\s*player/i.test(header)) {
    throw new Error('roster CSV must start with a "club,player" header');
  }

  const index = buildIndex(catalog);
  const seed = parseClubPlayerRows(lines, index, "row");
  if (new Set(seed.map(p => p.clubId)).size < 2) throw new Error("roster must name at least 2 clubs");
  return seed;
}

export interface TournamentRoster {
  tournamentName: string | null;
  seasonNumber: number;
  budgetStep: number;
  seed: SeedPlayer[];
  poolSeed: SeedPlayer[];
  /** ClubIds in finishing order, worst-first (same convention as `positionStepBudgets`).
   *  Empty for season 1, where nobody has a rank yet (any standings in the file are ignored). */
  finishingOrder: string[];
  /** clubId -> money the club had left at the end of the previous season (season 2+; 0 when not given). */
  leftovers: Record<string, number>;
}

/** Splits a tournament CSV into its meta lines (before any section) and named `## SECTION`
 *  blocks (each section's own header row is kept as its first line). Blank lines are dropped;
 *  a line starting with "#" that isn't a "## " section marker is a plain comment, also dropped. */
function splitSections(csv: string): { meta: string[]; sections: Record<string, string[]> } {
  const meta: string[] = [];
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  for (const raw of csv.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) { current = line.slice(3).trim().toUpperCase(); sections[current] = []; continue; }
    if (line.startsWith("#")) continue;
    (current ? sections[current]! : meta).push(line);
  }
  return { meta, sections };
}

function parseClubPlayerSection(lines: string[], index: CatalogIndex, sectionName: string): SeedPlayer[] {
  const header = lines[0];
  if (!header || !/^club\s*,\s*player/i.test(header)) {
    throw new Error(`"## ${sectionName}" section must start with a "club,player" header`);
  }
  return parseClubPlayerRows(lines, index, `${sectionName} row`);
}

/**
 * Parses the richer tournament CSV format: `key,value` metadata (tournament name, season
 * number, per-position budget step), a `## TEAMS` section carrying each club's finishing
 * position from the prior season (required from season 2 onward; ignored in season 1 —
 * nobody has a rank yet), a `## SQUADS` section (every manager's starting roster), and an
 * optional `## POOL` section (extra free-agent players available from the start).
 */
export function parseTournamentCsv(csv: string, catalog: SeedPlayer[]): TournamentRoster {
  const { meta, sections } = splitSections(csv);
  const index = buildIndex(catalog);

  const metaMap = new Map(meta.map(line => {
    const [key, ...rest] = parseCsvLine(line);
    return [normalizeForMatch(key ?? ""), rest.join(",").trim()] as const;
  }));
  const tournamentName = metaMap.get("tournament") || null;
  const seasonRaw = metaMap.get("season") ?? "1";
  const seasonNumber = Number(seasonRaw);
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1) throw new Error(`season must be a positive integer, got "${seasonRaw}"`);
  const budgetStep = Number(metaMap.get("budgetstep") ?? "0");
  if (!Number.isFinite(budgetStep)) throw new Error("budgetStep must be a number");

  const squadLines = sections["SQUADS"];
  if (!squadLines) throw new Error('tournament CSV needs a "## SQUADS" section');
  const poolLines = sections["POOL"];

  // Parse both sections before throwing, so a host with bad rows in SQUADS *and* POOL sees
  // every problem in one pass instead of fixing one section, resubmitting, then hitting the next.
  let seed: SeedPlayer[] = [];
  let poolSeed: SeedPlayer[] = [];
  const sectionErrors: string[] = [];
  try { seed = parseClubPlayerSection(squadLines, index, "SQUADS"); }
  catch (e) { sectionErrors.push((e as Error).message); }
  if (poolLines) {
    try { poolSeed = parseClubPlayerSection(poolLines, index, "POOL"); }
    catch (e) { sectionErrors.push((e as Error).message); }
  }
  if (sectionErrors.length > 0) throw new Error(sectionErrors.join("\n"));

  const squadClubIds = new Set(seed.map(p => p.clubId!));
  if (squadClubIds.size < 2) throw new Error("roster must name at least 2 clubs");

  // Standings only count from season 2 (they set each club's budget). In season 1 the whole TEAMS section,
  // finishing positions included, is not looked at: nobody has a rank yet, so anything written there is ignored.
  const teamLines = seasonNumber === 1 ? [] : (sections["TEAMS"] ?? []);
  const teamHeader = teamLines[0];
  const positions = new Map<string, string>(); // clubId -> raw finishingPosition text
  const leftoverRaw = new Map<string, string>(); // clubId -> raw leftover text
  if (teamLines.length) {
    if (!teamHeader || !/^club\s*,\s*finishingposition/i.test(teamHeader.replace(/\s+/g, ""))) {
      throw new Error('"## TEAMS" section must start with a "club,finishingPosition" header');
    }
    for (let i = 1; i < teamLines.length; i++) {
      const [clubRaw, posRaw, leftRaw] = parseCsvLine(teamLines[i]!);
      if (!clubRaw) continue;
      positions.set(slugifyClub(clubRaw), (posRaw ?? "").trim());
      leftoverRaw.set(slugifyClub(clubRaw), (leftRaw ?? "").trim());
    }
  }

  let finishingOrder: string[] = [];
  const leftovers: Record<string, number> = {};
  if (seasonNumber !== 1) {
    const entries: { clubId: string; pos: number }[] = [];
    for (const clubId of squadClubIds) {
      const raw = positions.get(clubId);
      if (!raw) throw new Error(`missing finishing position for "${clubId}" (required from season 2 onward)`);
      const pos = Number(raw);
      if (!Number.isInteger(pos) || pos < 1) throw new Error(`bad finishing position "${raw}" for "${clubId}"`);
      entries.push({ clubId, pos });
    }
    if (new Set(entries.map(e => e.pos)).size !== entries.length) throw new Error("duplicate finishing position in TEAMS section");
    finishingOrder = entries.sort((a, b) => b.pos - a.pos).map(e => e.clubId); // worst (highest number) first
    // Money each club had left last season (the `leftover` column): carried into the new season's budget.
    for (const clubId of squadClubIds) {
      const raw = leftoverRaw.get(clubId) ?? "";
      const n = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(n) || n < 0) throw new Error(`bad leftover "${raw}" for "${clubId}" (a number of millions, 0 or more)`);
      leftovers[clubId] = n;
    }
  }

  return { tournamentName, seasonNumber, budgetStep, seed, poolSeed, finishingOrder, leftovers };
}
