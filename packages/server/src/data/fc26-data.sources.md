# FC 26 player data — provenance & model

**Compiled:** 2026-09-20 · **Game:** EA Sports FC 26 (`fifa_version` 26, roster update 19-09-2025)

## Why FC 26 (not Transfermarkt)

The drafted squads must map 1:1 to what players set up in-game. So the source of truth is the **EA FC 26 player database**, and the auction's "listed value" is each player's **in-game transfer value** (`value_eur`). This supersedes the earlier Transfermarkt-style hand seed.

## Source

- Raw CSV (18,405 players, sofifa-style schema): `https://raw.githubusercontent.com/Peritosh/FC_26_Analysis_Report/main/FC26_Dataset.csv` (mirrors the Kaggle FC 26 database). Key columns used: `player_id`, `short_name`, `player_positions`, `overall`, `value_eur`, `club_name`.
- Ingested by `scripts/ingest-fc26.mjs` (repo root). Re-run: `node scripts/ingest-fc26.mjs <FC26_Dataset.csv>`. The raw CSV is not committed (11 MB); re-download from the URL above to regenerate.

## Outputs

| File | Contents | Used by |
| --- | --- | --- |
| `packages/server/src/data/fc26-catalog.json` | **All 18,405 players** — `{ id, name, position, positionDetail, altPositions, value(€M), overall, club, clubId }`. `positionDetail` is the exact FC slot (ST/CB/CDM/RW/...); `altPositions` lists any other real positions they can play, most-to-least natural. Both merged in via `scripts/merge-positions.mjs` from the same raw dataset CSV's `player_positions` field, for the post-draft pitch view and the position pill shown everywhere in the UI. The host's pool-pick universe + search source. 2.1 MB, server-side only (never bundled to the browser). | Server (pool builder, search, room init) |
| `packages/shared/src/data/seed/squads.json` | The **5 club starting squads only** (134 players), same shape. Light (16 KB). | Shared/tests + room init squad assignment |

`clubId` is one of `real / barca / bayern / arsenal / city` for the five tournament clubs, else `null` (pool-eligible).

## Data model (changed from the original pitch)

- **Every player accountable:** the full FC 26 catalog is loaded server-side. Any player is discoverable via search.
- **5 clubs** get their **full real FC 26 roster** (24–30 players incl. bench/youth). Reserved budget = sum of that squad's `value`.
- **Pool = host pre-curated.** Before the draft the host searches the catalog and hand-picks which non-club players are actually in play. Only the 5 squads + the curated pool sync to phones; the rest of the catalog is just a searchable source for the host's picker.

## Derived numbers

| Club | Squad size | Squad value (reserved) €M |
| --- | --- | --- |
| Real Madrid | 30 | 1424 |
| Arsenal | 24 | 1145 |
| Barcelona | 28 | 1133 |
| Man City | 26 | 1089 |
| Bayern | 26 | 911 |

- **Budget floor** = priciest squad (Real 1424) rounded up to a clean 100 = **€1500M**.
- **Priciest pool player:** €150.5M (F. Wirtz, Liverpool). Top pool also: Vitinha, Dembélé, Hakimi, Isak, Kvaratskhelia, Palmer, J. Álvarez.

## Position mapping

FC position tokens → app buckets (primary position wins):
`GK→GK` · `CB/RB/LB/RWB/LWB→DEF` · `CDM/CM/CAM/RM/LM→MID` · `ST/CF/RW/LW→FWD`.
Note: wide **RM/LM map to MID** (wingers RW/LW map to FWD), so e.g. Yamal (RM primary) shows as MID. The formation view is display-only, so this is cosmetic; tune the map in `ingest-fc26.mjs` if you'd rather treat wide players as forwards.

## Club budgets by star rating

`packages/server/src/data/club-star-ratings.csv` (662 clubs, `Club,Stars,Source`) holds each real
club's FC 26 star rating (0.5-5.0), scraped from fifagamenews.com. `src/clubStars.ts` matches a
roster's club name to this file (exact, then unambiguous loose match) and converts stars to a
budget: **€300M per star** — 5.0★ = €1500M, 0.5★ = €150M, linear.

Whenever a room is created from an uploaded roster CSV (not the built-in 5-club seed), every
club's budget is set this way instead of the flat `totalBudget` the host typed — a club the
ratings file has never heard of falls back to that flat `totalBudget` rather than a guess. Season
2+ finishing-position budget stepping (`positionStepBudgets`) still takes precedence when a
tournament CSV supplies finishing positions.

## Refresh (per spec §4.10)

Once per season, before the draft, re-download the current FC CSV (FC 26 update, or FC 27 when its full DB exists) and re-run the ingest. Keep `id` (= FC `player_id`) stable so season carryover and price history line up.

## Checking a roster CSV before uploading it

The app's own upload path (`packages/server/src/roster.ts`) is deliberately lenient — it never
blocks an upload, silently falling back to name-matching and then a club-average placeholder for
anything it can't pin down. `scripts/roster_matcher.py` is a separate, standalone pre-flight
check you run yourself before uploading: it grades every row green (confident)/yellow (probable —
confirm a transfer or ambiguity)/red (no real player found — pick one or accept a placeholder by
hand), and writes a clean `club,player,number,id` file with ids already resolved for anything
green/yellow.

```
python3 scripts/roster_matcher.py <raw-FC26-dataset.csv> <your-roster.csv> <out_dir>
```

The first argument is the *raw* dataset CSV (e.g. the `FC26_*.csv` this repo's `ingest-fc26.mjs`
consumes — see above), not the app's processed `fc26-catalog.json`.
