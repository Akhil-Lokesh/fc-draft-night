import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeForMatch } from "./clubs.js";

const CSV_PATH = fileURLToPath(new URL("./data/club-star-ratings.csv", import.meta.url));

interface Rated { normalized: string; stars: number }

function loadRatings(): Rated[] {
  const raw = readFileSync(CSV_PATH, "utf-8").replace(/^﻿/, "");
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rated: Rated[] = [];
  for (const line of lines.slice(1)) { // skip "Club,Stars,Source" header
    const [name, starsRaw] = line.split(",");
    if (!name || !starsRaw) continue;
    if (name.trim().endsWith("(W)")) continue; // women's team variants — out of scope for this app
    rated.push({ normalized: normalizeForMatch(name), stars: Number(starsRaw) });
  }
  return rated;
}

const RATINGS = loadRatings();
const byExactName = new Map(RATINGS.map(r => [r.normalized, r.stars]));

/**
 * A club's FC 26 star rating (0.5-5.0), by name — exact match first, then an unambiguous loose
 * (substring) match for spelling differences between the ratings file and the roster/catalog
 * (e.g. ratings file's "Bayern" vs catalog's "FC Bayern München"). Returns null rather than
 * guessing when the ratings file has never heard of the club, or when a loose match is
 * ambiguous (multiple candidates) — budget money is real stakes, not worth a wrong guess.
 */
export function starsFor(clubName: string): number | null {
  const norm = normalizeForMatch(clubName);
  const exact = byExactName.get(norm);
  if (exact !== undefined) return exact;

  const loose = RATINGS.filter(r => r.normalized.includes(norm) || norm.includes(r.normalized));
  if (loose.length === 1) return loose[0]!.stars;
  return null;
}

/** Linear: 5.0 stars = €1500M, every 0.5 stars down = €150M less (so 0.5 stars = €150M). */
export function budgetForStars(stars: number): number {
  return Math.round(stars * 300);
}
