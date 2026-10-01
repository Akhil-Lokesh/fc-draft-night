Paste everything below the line into an AI (ChatGPT, Claude, Gemini…). Fill in the part under "MY LEAGUE" first.

---

You are preparing a roster upload file (CSV) for **FC Draft Night**, a football draft game. The app is strict about the structure, so follow the two tables below exactly: **Table 1 explains every part of the file. Table 2 shows correct and wrong examples of each part.** After the tables there is one complete file to copy the shape from.

**Reply with ONLY the finished CSV inside one code block — no explanation before or after.**

## MY LEAGUE (fill this in)

- Tournament name: `[e.g. Friday Night League]`
- Season: `[1 for a brand-new league]`
- Teams: `[e.g. Chelsea, Atletico Madrid, Arsenal, Inter, Napoli]`
- Squads: `[e.g. each club's current first-team squad as in EA Sports FC 26 — or: "I will give you the lists below"]`
- Free-agent pool: `[e.g. 10 well-known players from clubs NOT listed above — or: none]`

## TABLE 1 — What every part of the file means

The file has three top lines, then up to three sections. Each section starts with a marker line (`## NAME`) followed by its own header row. Lines starting with `#` and blank lines are ignored.

| Part | Line / column | Required? | What to put | Rules |
|---|---|---|---|---|
| Top lines | `tournament,<name>` | Optional | The league's name | Any text; avoid commas and quotes |
| Top lines | `season,<number>` | Required | `1` for a brand-new league, `2`, `3`… for later seasons | Whole number, 1 or more |
| Top lines | `budgetStep,<number>` | Optional (default 0) | The budget gap between finishing positions, used from season 2 onward | A number. Use `0` unless I say otherwise |
| `## TEAMS` | header row | Always include | Exactly `club,finishingPosition` | Copy it exactly |
| `## TEAMS` | `club` | Required | One row per team, named as FC 26 names the club | 2 to 10 teams. Each club once. Same spelling as in SQUADS. Accents and capitals are ignored |
| `## TEAMS` | `finishingPosition` | Season 1: leave empty. Season 2+: required | Last season's league position for that team | Season 1: EMPTY for every team (keep the comma). Season 2+: a different whole number for every team, 1 = champion |
| `## SQUADS` | header row | Required | Exactly `club,player,number,id,score` | Columns are read by their header names: copy it exactly and keep every row's cells in the same order |
| `## SQUADS` | `club` (1st column) | Required | The team that owns this player | Must be one of the teams in TEAMS |
| `## SQUADS` | `player` (2nd) | Required | The player's name as EA Sports FC 26 shows it | First initial + surname (`C. Palmer`), or the single name the game uses (`Pedri`, `Rodri`, `Vini Jr.`) |
| `## SQUADS` | `number` (3rd) | Optional | Shirt number | Whole number 1 or more. Leave EMPTY (keep the comma) if unsure. Never guess. Repeats are fine |
| `## SQUADS` | `id` (4th) | Optional | The player's exact FC 26 catalog id, only if I give you one | Otherwise leave it empty. Never invent one |
| `## SQUADS` | `score` (5th) | Recommended | The player's FC 26 **overall rating**, a whole number from 1 to 99 (for example `90`, `85`) | Only a rating you actually know; otherwise leave it empty. It tells two players with the same name apart and rates a player FC 26 doesn't know. A player FC 26 already knows keeps the game's real rating, so a wrong score is harmless but still don't guess |
| `## SQUADS` | `value` and `position` (extra columns) | Only for a player FC 26 does not know | Market value in millions of euros, and the role | Add `value,position` to the END of the header (`club,player,number,id,score,value,position`) and then give EVERY row in that section all seven cells. `value` is a number above 0; `position` is exactly `GK`, `DEF`, `MID` or `FWD`. Never give them for a player FC 26 already has |
| `## POOL` | whole section | Optional | Free agents anyone can claim from the start; same header and columns as SQUADS | The club can be any real club, including clubs not in TEAMS. If there is no pool, leave out the whole section, header row included |
| `## SQUADS` | how a row is matched | — | — | The app tries, in order: the `id`; then the `player` name; then the same club + `number` + `score` together (only if exactly one player fits). So fill the number and score whenever you know them |
| Whole file | every player | — | — | **A player appears exactly ONCE in the whole file**: one squad or the pool, never two places. At least 2 teams in total |

## TABLE 2 — Examples: correct, wrong, and what the app does

| Part | Correct | Wrong | What the app does with the wrong one |
|---|---|---|---|
| Season 1 team | `Chelsea,` | `Chelsea,1` | Rejects the file: season 1 can't have finishing positions |
| Season 2 teams | `Chelsea,1` `Arsenal,2` `Atletico Madrid,3` | `Chelsea,1` `Arsenal,1` … or a team with no number | Rejects the file: duplicate or missing finishing position |
| Squad row | `Chelsea,C. Palmer,20,257534,87` | `Chelsea,C. Palmer,twenty,257534,87` | Rejects the file: bad shirt number |
| Unknown shirt number | `Chelsea,C. Palmer,,257534,87` | `Chelsea,C. Palmer,0,257534,87` | Rejects the file: bad shirt number (0 is not allowed; leave it empty) |
| Missing name | `Chelsea,C. Palmer,20,257534,87` | `Chelsea,,20,257534,87` | Rejects the file: missing club or player |
| Score | `Chelsea,C. Palmer,20,257534,87` | `Chelsea,C. Palmer,20,257534,ninety` or `…,0` or `…,100` | Rejects the file: a score is a whole number from 1 to 99 |
| Two players, same name | `Liverpool,J. Bellingham,5,,74` | `Liverpool,J. Bellingham,5,,` (no score) | Without a score the app picks the most valuable one, which may be the wrong player. The score names the right one, even over the club |
| Score on a KNOWN player | `Chelsea,C. Palmer,20,257534,87` | `Chelsea,C. Palmer,20,257534,50` | Ignores the 50; the game's real rating wins. Don't guess scores |
| Player too new for FC 26 | `Chelsea,J. Newplayer,,,63,12,MID` (7-cell header) | `Chelsea,J. Newplayer,,,63,12,MIDFIELD` | Rejects the file: position must be GK, DEF, MID or FWD |
| Value for a new player | `Chelsea,J. Newplayer,,,63,12,MID` | `Chelsea,J. Newplayer,,,63,0,MID` or `…,cheap,MID` | Rejects the file: value must be a number above 0 |
| Value on a KNOWN player | `Chelsea,C. Palmer,20,257534,87,,` | `Chelsea,C. Palmer,20,257534,87,999,GK` | Ignores the 999 and GK; the game's real stats win. Don't add them |
| Same player twice | `Chelsea,C. Palmer,20` only | `Chelsea,C. Palmer,20` and `Arsenal,C. Palmer,20` | **Does NOT warn.** He goes to whichever manager joins last and the other team silently loses him |
| Misspelt player | `Arsenal,B. Saka,7` | `Arsenal,B. Sakka,7` or an invented name | **Does NOT warn.** The player is created as an unknown: a low €0.5M value, the squad's most common position, and the rating from his score (55 if there is none), not the real stats |
| Club spelling | `Atletico Madrid` | — | `atletico madrid` and `ATLÉTICO MADRID` count as the same club |
| Only one team | two or more teams | a file with one club | Rejects the file: needs at least 2 clubs |

## A COMPLETE FILE (season 1, 3 teams, 2 pool players)

The structure to copy. In a real file each squad is the full first team, roughly 22–30 players; this one is short only to show the shape.

```csv
tournament,Friday Night League
season,1
budgetStep,0

## TEAMS
club,finishingPosition
Chelsea,
Atletico Madrid,
Arsenal,

## SQUADS
club,player,number,id,score
Chelsea,C. Palmer,20,257534,87
Chelsea,M. Caicedo,25,256079,87
Chelsea,E. Fernandez,8,247090,84
Atletico Madrid,J. Alvarez,19,246191,87
Atletico Madrid,Pablo Barrios,24,272449,82
Arsenal,B. Saka,7,246669,88
Arsenal,M. Odegaard,8,222665,87

## POOL
club,player,number,id,score
Liverpool,F. Wirtz,7,256630,89
Liverpool,A. Isak,9,233731,88
```

The ids and scores above are the real FC 26 ones. **In your file, only write an id or a score you actually know; leave the cell empty otherwise.** An empty `id` and `score` is always fine (`Chelsea,C. Palmer,20,,`).

For season 2 the TEAMS section changes to unique positions and the top lines change; everything else stays the same:

```csv
tournament,Friday Night League
season,2
budgetStep,0

## TEAMS
club,finishingPosition
Chelsea,1
Atletico Madrid,3
Arsenal,2
```

## BEFORE YOU ANSWER — CHECK

- [ ] Starts with the three top lines, then `## TEAMS`, then `## SQUADS`.
- [ ] 2 to 10 teams; every club in SQUADS is in TEAMS with identical spelling.
- [ ] Season 1: finishingPosition empty for all. Season 2+: unique whole numbers for all.
- [ ] **No player appears twice anywhere in the file** (search each name).
- [ ] Every name is spelled the way FC 26 spells it; empty shirt number, id and score wherever you are unsure (never guess).
- [ ] Every SQUADS and POOL row has the same number of cells as its header.
- [ ] Only the CSV in one code block — no comments, no quotes, no explanations.
