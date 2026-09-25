"""
Roster matcher reference implementation for FC Draft Night.

Matches every roster CSV row to one FC 26 catalog player and grades it:
  green  = confident match, safe to use
  yellow = probable match, host should confirm (transfer, ambiguity, fuzzy)
  red    = no real player found, needs a host decision (pick one or approve a placeholder)

Standalone pre-upload check: run this BEFORE uploading a roster to Host Setup, to catch
transfers/typos/unknown players yourself instead of letting the app's own (deliberately
lenient — see packages/server/src/roster.ts) matching silently fall back to name-matching
or a club-average placeholder for anything it can't pin down confidently.

Usage:
  python3 roster_matcher.py <catalog.csv> <roster.csv> <out_dir>

<catalog.csv> is the raw FC 26 dataset CSV (see packages/server/src/data/fc26-data.sources.md
for where to get it — e.g. FC26_20250921.csv at the repo root), NOT the app's processed
fc26-catalog.json.

Outputs:
  roster-matched.csv  one row per roster player with the match, grade and reason
  roster-clean.csv    the roster in app format (club,player,number,id) with resolved ids
                       (blank id on a red row — fill it in by hand before uploading)
"""

from __future__ import annotations

import csv
import re
import sys
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

# ---------- Normalizing ----------

def norm(text: str) -> str:
    """Lowercase, strip accents, turn punctuation into spaces, collapse spaces."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace("ł", "l").replace("ø", "o").replace("ß", "ss")
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokens(text: str) -> list[str]:
    return norm(text).split()


# Typed club name -> exact catalog club name. Extend as new clubs appear.
CLUB_ALIASES = {
    "as roma": "Roma",
    "barcelona": "FC Barcelona",
    "fc porto": "FC Porto",
    "porto": "FC Porto",
    "psv": "PSV",
    "psv eindhoven": "PSV",
    "real madrid": "Real Madrid",
    "man utd": "Manchester United",
    "man united": "Manchester United",
    "man city": "Manchester City",
    "spurs": "Tottenham Hotspur",
    "psg": "Paris Saint-Germain",
    "inter": "Inter",
    "atletico madrid": "Atlético Madrid",
}

GREEN, YELLOW, RED = "green", "yellow", "red"


# ---------- Catalog index (built once, O(1) lookups afterward) ----------

class Catalog:
    def __init__(self, path: str):
        self.by_id: dict[str, dict] = {}
        self.by_club: dict[str, list[dict]] = defaultdict(list)
        self.by_token: dict[str, set[str]] = defaultdict(set)  # name token -> player ids
        self.club_names: dict[str, str] = {}                   # normalized club -> real club

        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                pid = row["player_id"]
                row["_short"] = tokens(row["short_name"])
                row["_long"] = tokens(row["long_name"])
                row["_all"] = set(row["_short"]) | set(row["_long"])
                self.by_id[pid] = row
                self.by_club[row["club_name"]].append(row)
                self.club_names[norm(row["club_name"])] = row["club_name"]
                for tok in row["_all"]:
                    if len(tok) > 1:
                        self.by_token[tok].add(pid)

    def resolve_club(self, typed: str) -> str | None:
        """Exact alias or exact normalized name only. Never a loose match."""
        key = norm(typed)
        if key in CLUB_ALIASES:
            return CLUB_ALIASES[key]
        return self.club_names.get(key)


# ---------- Scoring one typed name against one catalog player ----------

def name_score(typed: str, player: dict) -> float:
    t = tokens(typed)
    if not t:
        return 0.0
    typed_norm = " ".join(t)
    if typed_norm in (" ".join(player["_short"]), " ".join(player["_long"])):
        return 1.00                                    # exact short or long name
    if all(tok in player["_all"] for tok in t):
        return 0.95                                    # every typed word appears
    surname, first = t[-1], t[0]
    firsts = {player["_long"][0][0] if player["_long"] else "",
              player["_short"][0][0] if player["_short"] else ""}
    if len(t) > 1 and surname in player["_all"] and first[0] in firsts:
        return 0.90                                    # initial + surname ("D. Costa")
    if len(t) == 1 and t[0] in player["_all"]:
        return 0.85                                    # one-word name inside a longer one
    # Fuzzy fallback on the full strings (typos, transliteration)
    best = max(
        SequenceMatcher(None, typed_norm, " ".join(player["_short"])).ratio(),
        SequenceMatcher(None, typed_norm, " ".join(player["_long"])).ratio(),
    )
    return round(best * 0.9, 3)                        # fuzzy never beats a rule match


def best_of(typed: str, candidates) -> tuple[dict | None, float, int]:
    """Best candidate, its score, and how many candidates scored within 0.02 of it."""
    scored = sorted(((name_score(typed, p), p) for p in candidates), key=lambda x: -x[0])
    if not scored or scored[0][0] == 0:
        return None, 0.0, 0
    top = scored[0][0]
    ties = sum(1 for s, _ in scored if top - s <= 0.02)
    return scored[0][1], top, ties


# ---------- Matching one row ----------

def match_row(cat: Catalog, club: str, name: str, typed_id: str) -> dict:
    real_club = cat.resolve_club(club)

    # Step 1: typed id, trusted whenever the name agrees. Club is NEVER checked here — a real
    # player's club changes over time and the roster CSV's club always wins over the database's
    # (same rule the app itself uses), so a transfer is never a reason to downgrade a confident
    # id+name match.
    if typed_id:
        p = cat.by_id.get(typed_id)
        if p is not None:
            s = name_score(name, p)
            if s >= 0.85:
                return result(p, GREEN, "id", "")
            note_id = f"id {typed_id} is {p['short_name']}, name disagrees"
        else:
            note_id = f"id {typed_id} not in catalog"
    else:
        note_id = "no id"

    # Step 2: inside the typed club's squad (about 30 players, cheap, and usually right)
    if real_club:
        p, s, ties = best_of(name, cat.by_club.get(real_club, []))
        if p and s >= 0.85:
            if ties > 1:
                return result(p, YELLOW, "club-name", f"{note_id}; {ties} similar names in club")
            return result(p, GREEN if s >= 0.90 else YELLOW, "club-name", note_id)

    # Step 3: whole catalog, but only players sharing a name token (small candidate set). Club is
    # irrelevant here too — the only real uncertainty left is namesake ambiguity, not which club
    # the database happens to list them at.
    cand_ids = set()
    for tok in tokens(name):
        if len(tok) > 1:
            cand_ids |= cat.by_token.get(tok, set())
    scored = sorted(((name_score(name, cat.by_id[i]), cat.by_id[i]) for i in cand_ids),
                    key=lambda x: -x[0])
    plausible = [(s, p) for s, p in scored if s >= 0.85]
    # Auto-pick across clubs only when exactly one player is even plausible
    # A typed id the catalog lacks means a player the catalog lacks: never auto-pick another club's
    id_missing = bool(typed_id) and typed_id not in cat.by_id
    if len(plausible) == 1 and plausible[0][0] >= 0.95 and not id_missing:
        p = plausible[0][1]
        return result(p, GREEN, "global-name", note_id)
    if plausible:
        options = ", ".join(f"{p['short_name']} ({p['club_name']}, id {p['player_id']})"
                            for _, p in plausible[:3])
        return result(None, RED, "none",
                      f"{note_id}; {len(plausible)} possible namesake(s), not auto-picked: {options}")

    return result(None, RED, "none", f"{note_id}; not in catalog")


def result(p, status, method, note):
    return {"player": p, "status": status, "method": method, "note": note}


# ---------- Reading the roster file ----------

def read_roster(path: str):
    section, header = None, None
    with open(path, encoding="utf-8") as f:
        for line in f.read().splitlines():
            if line.startswith("## "):
                section, header = line[3:].strip(), None
                continue
            # A line starting with "#" that isn't a "## " section marker is a plain comment
            # (the app's own roster format allows these freely, and the shipped template is
            # full of them) — never treat one as the section's header or a data row.
            if line.startswith("#"):
                continue
            if section not in ("SQUADS", "POOL") or not line.strip():
                continue
            cells = next(csv.reader([line]))
            if header is None:
                header = [c.strip().lower() for c in cells]
                continue
            row = dict(zip(header, cells))
            yield {
                "section": section,
                "club": row.get("club", "").strip(),
                "player": row.get("player", "").strip(),
                "number": row.get("number", "").strip(),
                # accept both header spellings
                "id": (row.get("id") or row.get("player_id") or "").strip(),
            }


# ---------- Main ----------

def main(catalog_path, roster_path, out_dir):
    cat = Catalog(catalog_path)
    rows = list(read_roster(roster_path))
    matched = [(r, match_row(cat, r["club"], r["player"], r["id"])) for r in rows]

    # Same catalog player used twice in one upload -> both rows go red
    seen = defaultdict(list)
    for i, (_, m) in enumerate(matched):
        if m["player"]:
            seen[m["player"]["player_id"]].append(i)
    for pid, idxs in seen.items():
        if len(idxs) > 1:
            for i in idxs:
                matched[i][1]["status"] = RED
                matched[i][1]["note"] += f"; duplicate of row(s) {[j + 1 for j in idxs if j != i]}"

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    cols = ["row", "section", "club", "player", "number", "typed_id", "status", "method",
            "matched_id", "matched_short_name", "matched_long_name", "catalog_club",
            "positions", "overall", "value_eur", "note"]
    with open(out / "roster-matched.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for i, (r, m) in enumerate(matched, 1):
            p = m["player"] or {}
            w.writerow([i, r["section"], r["club"], r["player"], r["number"], r["id"],
                        m["status"], m["method"], p.get("player_id", ""), p.get("short_name", ""),
                        p.get("long_name", ""), p.get("club_name", ""), p.get("player_positions", ""),
                        p.get("overall", ""), p.get("value_eur", ""), m["note"].strip("; ")])

    # Clean roster: original file with SQUADS/POOL rows rewritten as club,player,number,id
    resolved = iter(matched)
    lines_out, section, header_done = [], None, False
    with open(roster_path, encoding="utf-8") as f:
        for line in f.read().splitlines():
            if line.startswith("## "):
                section, header_done = line[3:].strip(), False
                lines_out.append(line)
                continue
            if line.startswith("#"):
                lines_out.append(line)  # a plain comment — keep it, but it's never the header/data
                continue
            if section in ("SQUADS", "POOL") and line.strip():
                if not header_done:
                    lines_out.append("club,player,number,id")
                    header_done = True
                    continue
                r, m = next(resolved)
                pid = m["player"]["player_id"] if m["player"] and m["status"] != RED else ""
                lines_out.append(",".join([r["club"], r["player"], r["number"], pid]))
                continue
            lines_out.append(line)
    (out / "roster-clean.csv").write_text("\n".join(lines_out) + "\n", encoding="utf-8")

    counts = defaultdict(int)
    for _, m in matched:
        counts[m["status"]] += 1
    print(f"{len(matched)} rows: {counts[GREEN]} green, {counts[YELLOW]} yellow, {counts[RED]} red")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
