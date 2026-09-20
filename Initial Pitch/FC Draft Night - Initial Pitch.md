# FC Draft Night — Initial Pitch

2026-09-19 · @Someone

## The idea

Before playing a custom tournament in FC 26 or FC 27, the five of you run a live transfer-market draft night instead of just picking ready-made real teams. Everyone starts with the same budget, a shared pool of real players goes up for grabs, and each manager builds their squad through bidding rather than static team selection. Squad-building becomes its own competitive event before a ball is kicked, and it fixes the two gaps the in-game custom tournament setup doesn't cover: a shared budget with real stakes, and a way to fight over the same star player instead of one person just picking Man City and taking Mbappé uncontested.

## How the draft works

This is an auction draft with matching rights, not a simple turn-based snake draft: once a player is on someone's squad, anyone else can try to poach them by bidding above the current price, and the incumbent gets a limited number of chances to keep them.

**The five teams and the pool.** Each manager starts as one of five real clubs — Arsenal, Bayern Munich, Real Madrid, Barcelona, and Manchester City — and begins holding that club's real starting squad. Bidding wars happen two ways: challenging a player already on one of the other four managers' squads, or drafting a player from a separate pool of players who aren't on any of the five squads. Every squad and every pool player is pulled from club rosters only, never national teams — a player like Mbappé turns out for both Real Madrid and France, and mixing in country squads would let the same real person show up twice in the data.

**Budget.** The host picks the total budget for the tournament when setting up the room — every manager starts with that same total, whatever the host chose (500M is just the number we've used throughout as an example). What isn't equal is how much of it gets tied up automatically: your reserved amount is the real sum of your existing squad's listed values, player by player, pulled straight from the dataset. A squad that's genuinely worth more in real life reserves more of the 500M before anyone touches anything. Real Madrid, for example, might have a squad totaling 425M in real listed value (Mbappé's 200M included in that), leaving them only 75M spendable — while a club with a cheaper real squad would start the draft with far more spendable room. What it costs to act still depends on ownership the same way: defending one of your own players only costs the amount above their listed value, while acquiring anyone you don't already own costs the full final price. A manager can never submit a quote that costs more than their remaining spendable budget — the app blocks it outright. Because reserved amounts differ club to club, spendable budgets aren't identical at the start; the worked examples and mock draft below use a flat 250M spendable for every club just to keep the numbers easy to follow — in the real app each club's actual spendable would come straight out of their real squad's total value instead.

**Budget floor.** The host's chosen total budget must be able to cover the most expensive real squad in the tournament — it can't be set below what it costs to keep everyone's real players in the first place. The minimum is the most expensive club's actual squad value, rounded up to a clean number. Example: if the priciest real squad here is worth 545M, the host can't set a total budget below 600M.

**Selling & cashing in.** If the incumbent loses a player — whether they stop bidding, can't cover the needed increment, or are outbid outright — they don't receive whatever the buyer ends up paying. Instead, the amount they had reserved for that player (their listed value) is released back into their own spendable budget, since they no longer need to hold it aside for someone they don't have. The buyer separately pays the full final price from their own spendable. Those two numbers are deliberately unrelated: a bidding war can push the final price well above a player's listed value, but the seller only ever recovers what that player was originally worth to them — the premium never goes to anyone, it's simply the cost of winning a player outright. In a multi-way fight, only the original owner ever gets anything released — any other manager who bid and got outbid along the way spent nothing and gets nothing back. Pool players start with no owner, so winning one releases nothing to anyone; the winner's spendable just goes down.

**Overcommitment & parallel wars.** Because contests run in parallel, a manager can end up as the top bidder in more than one war at once for more money than they actually have. If only one of those wars closes in their favor, nothing changes — they simply pay for it as normal. If two or more try to close in their favor at once, deals are honored in the order they close: the first is completed normally, deducting its cost from spendable as usual. Any further deal that manager can no longer afford is voided, and the player goes to the runner-up — whoever had the next-highest standing bid in that same fight, at their bid, paid from their own spendable. Only when there was no other bidder does it fall back to the original owner keeping the player untouched, or to the pool if nobody owned them. On top of losing that player, the overcommitting manager takes a flat 25M fine against their remaining spendable budget for over-quoting.

For example: Arsenal has 100M spendable and is the top bidder in two wars at once, one at 50M and one at 70M — a combined 120M they don't have. The 50M deal closes first and goes through, leaving Arsenal with 50M spendable. The 70M deal then tries to close, but Arsenal can no longer cover it, so that player reverts to their previous owner and Arsenal takes the 25M fine. Arsenal ends up with 50M − 25M = 25M spendable left.

**Going negative.** The same fix applies any time a club's spendable would drop below zero, not just competing wins closing in the same hour. Whatever specific transaction pushed them there gets unwound — the player involved reverts to whoever had the next claim (the runner-up bidder, their previous owner, or the pool), same as an overcommitment — and the club still owes the flat 25M fine regardless of the reason. If 25M isn't sitting in their spendable even after that release, they release additional players of their own choosing back to the pool at those players' locked-in listed value, one at a time, until the fine is covered. The fine gets paid no matter how many players it takes.

**Starting a fight: the 2-minute listing window.** Every acquisition attempt starts as a listing. To go after a pool player, a manager lists a direct offer at that player's listed price; to walk away from a player they already own, an owner lists them back at that player's own listed value. Either way, a 2-minute countdown starts. If nobody else steps in before it runs out, the listing locks in automatically — the pool player joins that manager's squad, or the released player becomes available to the pool at his listed value. If another manager challenges the listing inside the 2-minute window, it escalates straight into the standard bidding war described below: continuous open bidding, closed by the 5-minute anti-snipe timer per quote (or the 1-hour draft clock, whichever comes first).

**How the cap applies to a challenged listing.** If a listing gets challenged, the original listing price counts as the lister's first quote. They get exactly one more raise before they're capped out, same as every other manager who piles into that fight.

**Minimum opening bid.** Any actual bid — a fresh challenge on someone's squad player, a raise, or a challenge against a listing — has to be strictly more than the player's current listed value, never equal to it. If Mbappé is listed at 200M, the first quote against him has to clear 200M, whether he's sitting on Real Madrid's squad or out in the pool. This doesn't apply to an uncontested listing itself — claiming a pool player or releasing your own still locks in at exactly the listed price if nobody steps in during the 2-minute window; the 'must exceed' rule only kicks in once it actually turns into a contest.

**Bidding war.** Any number of the five managers — up to all five at once — can be in the same fight over one player; it's never limited to two sides, and there's no turn order. Anyone can raise above the current peak at any point while the fight is live, whether they've been bidding from the start or just joined. Each fight closes the same way every contest does: 5 minutes of silence or the one-hour draft clock running out, whichever comes first (see Draft clock). Whoever's bid is on top when it closes wins the player at that price.

**Quote cap.** Each manager gets at most two quotes in any single fight for one player — their opening bid and one raise. Once both are used, that manager is done bidding on this player for the rest of this fight, even if the leading bid is later voided (say, from an overcommitment) and the price drops back within reach. Any number of managers can still pile into the same fight, each capped at two quotes of their own — the fight itself keeps running until the 5-minute anti-snipe timer or the 1-hour draft clock closes it, not on a fixed round count.

**Challenge limit.** Separately from the quote cap inside one fight, each manager can start at most 3 challenges against any one specific rival's currently-owned squad across a single season's draft — tracked one-directional per pair, so Arsenal's 3 challenges against Bayern's squad are entirely separate from Bayern's own 3 against Arsenal's. This only counts challenges initiated against a rival's owned players; going after an unowned pool player never uses any of it, since there's no rival to spend the limit against. It's what stops a well-funded manager from grinding one rival down player by player even though each individual fight stays fair on its own — see the scenario check below for why this exists. The count resets fresh at the start of each new season's draft.

**Player lock.** Once a contest resolves, the winner keeps that player for the rest of the season — nobody, including the managers who lost the fight, can challenge for them again until next season's draft. A player can only change hands once per season.

**Draft clock.** The whole draft runs inside a fixed one-hour window, and every individual quote inside a bidding war has its own short countdown (5 minutes by default, adjustable) so no single contest can stall the room. If a manager's countdown runs out without a quote, it counts as a pass and the current bid stands. Every new quote, from an existing bidder or a brand-new entrant, restarts that contest's own countdown, so nobody can just wait out the clock — a contest only closes when a full window passes with no new quote. When the hour ends, the draft closes immediately — any contest still in progress is decided at the last bid on the table. Contests run in parallel, not one at a time — several bidding wars can be live at once across different players, each ticking on its own independent clock, and a manager can be defending one of their players while challenging for someone else's at the same time. That's what keeps the hour from being bottlenecked by the 5-minute window: the real limit on pace is each manager's own attention and spendable budget, not a shared queue.

**Season carryover.** One draft happens before each season, not just once, and squads carry over as-is — whoever holds a player at the end of a season keeps them going into the next one, nothing resets back to the real-world rosters. Whatever price a player actually changed hands at becomes their new listed value from then on: if City signed Kane for 101M, he's now worth 101M for City's reserved budget and for anyone challenging for him next season, not his original 100M dataset value — that update is permanent and never reverts. Whatever spendable budget a manager doesn't use by the end of the hour also carries forward, on top of the fresh 250M for next season's draft. A manager who holds back 10M this season walks into next season's draft with 260M spendable instead of 250M, rewarding patience and giving the whole thing a running storyline across seasons instead of one isolated night.

**Renewing or releasing.** A successful defense permanently sets the new price as that player's listed value going forward — it doesn't reset next season. To keep him, his club can pay that same locked-in price again next season (or higher, if challenged). Or the club can choose to release him back to his original dataset value instead, and anyone — including his old club — can try to reacquire him at that lower number through the listing window above.

**Season-end handoff.** At the end of the tournament, once the season's actual results are in, the app exports everything that happened: every listing, every bidding war, final squads and spendable, plus blank fields for recording where each manager finished. The host fills in the finishing order and re-uploads the file at the start of next season's draft. Finishing position sets each manager's new base budget, stepped in 20M increments from the bottom up. Example: 600M base, five teams — 5th place stays at 600M, 4th gets 620M, 3rd gets 640M, 2nd gets 660M, 1st gets 680M. Whatever spendable budget a manager had left over at the end of last season is added on top of this new base.

**When reserved outgrows the new budget.** If a club's reserved cost — driven up by price rises from successful defenses last season — ends up higher than their new total budget at handoff, it's resolved the same way as any other negative balance (see Going negative): they release players back to the pool at those players' current listed value until their reserved amount fits under the new budget, and pay the standard 25M fine on top.

**Worked example.** Mbappé is listed at 200M, already covered by Real Madrid's reserved budget as part of their existing squad. Arsenal and Barcelona both get into a bidding war for him. Real Madrid can defend as long as they're willing to pay the increment above 200M from their spendable — if they raise to, say, 230M, that only costs them the 30M above his listed value, not the full 230M; if their spendable can't cover the needed increment, the app won't let them make that quote. Real Madrid eventually stops bidding, and Barcelona wins him at 250M. Barcelona pays the full 250M from their own spendable, but Real Madrid doesn't receive that 250M — the 200M they had reserved for Mbappé is released back into their own spendable budget instead, since they no longer need to hold it for a player they don't have. The extra 50M Barcelona paid above his listed value doesn't go to anyone; it's simply what it cost them to win him outright.

**Worked example: a five-way fight.** All five managers end up quoting on Haaland (180M value) over the course of the draft. City opens at 181M, Barcelona raises to 190M, Arsenal to 195M, Bayern to 200M, and City comes back with 205M — Real Madrid never actually raises and just isn't part of the action. A few minutes later Arsenal comes back in with 215M, Bayern answers with 220M, and then nobody raises again. Once 5 minutes pass with no new quote, the fight closes on its own — Bayern's 220M is the last one standing, so Bayern wins Haaland, and he's locked with them for the rest of the season.

**Player values.** Prices are pulled from a real transfer-value database rather than made up — market-value data in the same shape as Transfermarkt's (club rosters, valuations, and transfer history; a public dataset with exactly that structure already exists and could be the starting source). Because defending an owned player only costs the amount above their listed value, a star already on one of the five squads (like Mbappé at 200M) can carry a high real-world price without breaking the budget — the incumbent never has to raise the full amount, only the premium. Pool players work differently: nobody owns them going in, so whoever wins one pays the full price from spendable. To keep that reachable, the priciest pool player should land at roughly half of a typical club's spendable budget, with the rest scaling down from there in proportion to their real-world value — the same real-money gap between a superstar and a squad player, just scaled so an outright pool signing stays affordable.

**Data refresh.** Market values refresh once per season, right before that season's draft opens — the app pulls a fresh valuation snapshot for any player whose price hasn't already been set by an in-draft transaction. Once a draft is live, values are locked for the rest of that season; a price only moves from an actual bid, never from the dataset updating underneath everyone mid-draft.

The draft ends when the one-hour clock runs out, or earlier if every manager has used their spendable budget or reached the squad size the group agrees on — whichever comes first.

## MVP features

| Feature | What it does |
| --- | --- |
| Draft room | Host creates a room with a shareable code and sets the total budget per manager for this tournament — any amount, with 500M as a suggested default; up to 5 managers join by name, no accounts needed |
| Player pool | Searchable list of real players with position and market value |
| Budget tracker | Live running total of each manager's remaining budget, visible to everyone |
| Bid flow | Any manager can bid on an owned or unowned player; the current owner gets an instant on-screen alert |
| Retention window | Short countdown for the incumbent to match, raise, or release once challenged |
| Draft log | Live feed of every bid, win, and release so the room can follow the action in real time |
| Final squads | Per-manager summary of who they won and at what price, ready to reference when setting up the in-game teams |
| Season handoff export | Exports the season's full draft log and final squads (Excel/PDF/CSV) with blank fields for finishing position; re-uploading it next season sets each manager's new position-based base budget. |

## User flow

1. Host opens the app, sets the budget per manager and the squad rules, and gets a room code.
2. The other four join on their own phones using that code and pick a display name.
3. The app shows the player pool and everyone's starting budget; the host starts the draft.
4. Managers bid and challenge freely for the length of the draft, with live alerts whenever their own player is being challenged.
5. The draft closes once budgets or squads are full, and each manager sees their finished squad and total spend.
6. Everyone then goes into FC 26 or FC 27's Team Management to manually set their real team's roster to match their drafted squad, and starts the custom tournament as normal.

## Tech approach

This doesn't need accounts, a database of thousands of players, or a backend team — it needs five screens staying in sync for one evening. A Jackbox-style shared room fits: a lightweight web app, opened on each phone by scanning a code or typing a short room name, with a live-updating shared board (useful on a TV or laptop if you want one central view during the draft).

On the frontend, a simple React app works well and runs fine on phone browsers, no install needed. On the backend, the only real requirement is real-time sync so a bid or a match shows up on every screen within a second or two; a small WebSocket server or a realtime database service (Supabase or Firebase both fit) handles that without much custom infrastructure. The player pool itself can be a small preloaded dataset (30–50 players with position and value) rather than a live-updating football database, since the group only needs enough players to fill five squads.

## Open questions

- [ ] Squad rules: beyond keeping your club's existing squad, is there a minimum number of poached or pool players each manager must add, or is the 250M spendable purely optional?
- [x] Minimum opening bid: does a challenge have to open at or above the player's listed value, or can someone open below it?
- [x] Data refresh: real market values shift over time for players who've never changed hands — do you pull a fresh valuation snapshot before every season's draft for those, or lock the dataset once set?
- [x] Getting results into the game: since there's no way to feed draft results into FC 26/27 automatically, each manager sets their squad by hand in Team Management — is that an acceptable amount of manual setup before kickoff?

## Scenario check: does the two-quote cap hold up?

**One-on-one fight (works fine).** Barcelona challenges Real Madrid for Mbappé at 121M. Real Madrid uses quote 1 to go to 130M. Barcelona uses quote 2 to go to 140M. Real Madrid uses quote 2 to go to 150M. Both sides have now used two quotes each, so it closes there — Real Madrid keeps Mbappé for 150M, with 100M of their spendable 250M left for the rest of the draft. Fast, decisive, no endless escalation.

**The loophole.** The cap only limits how far one contest can go — it doesn't limit how many contests a manager can start. Nothing stops Barcelona from challenging every single Real Madrid player one at a time. Each fight is capped at two quotes, but there's no cap on the number of fights, so Real Madrid could be forced to burn their entire 250M just defending their own squad piece by piece, even though no single contest ever looked unfair.

**Recommendation: keep the two-quote cap, and add one more.** The per-contest cap is doing its job — it keeps individual fights quick and prevents one player from turning into a 20-round war. Pair it with a cap on challenges initiated, not just quotes made: each manager can start a maximum of 3 challenges against any one rival's squad across the whole draft. That closes the loophole without slowing down the fights themselves, and it pushes managers to pick their targets deliberately instead of nickel-and-diming one rival apart.

**Where this landed.** The version that stuck: the two-quote limit applies per manager, not to the fight as a whole. Any number of managers can pile into one fight, each capped at two quotes, and the fight itself still closes on the 5-minute anti-snipe timer or the 1-hour draft clock — not on a fixed round count. The five-way Haaland example below already plays out this way: City, Arsenal, and Bayern each used exactly two quotes (an opener and one raise) before they were capped, Barcelona only needed one, and Real Madrid never entered.

**And the challenge-limit fix below: also formalized.** The 3-challenges-per-rival idea in the recommendation above is now a real rule, not just a suggestion — see Challenge limit in "How the draft works," tracked one-directional per pair.

## Feature ideas for later phases

| Feature | What it adds |
| --- | --- |
| Countdown timer per quote | Each side gets a 5-minute window to use a quote before it defaults to the current bid, so a contest can't stall the whole draft |
| Challenge-limit tracker | Shows each manager how many of their 3 challenges against a given rival they've used, so the new cap is visible, not just remembered |
| Live budget bars | A bar per manager showing spendable budget draining in real time, visible to the whole room — makes it obvious who's running low |
| Squad + formation view | A pitch graphic that fills in as each manager wins players, so squads feel real instead of a list |
| Challenge history | Click any player to see their full bidding trail — every quote, who raised, and the final price — and click any team to see every contest they've started, joined, won, or lost this season |
| Draft recap card | An auto-generated end-of-draft summary — biggest steal, best bargain, most spent — for bragging rights after |
| Complete analytics | Full post-draft stats dashboard — spend efficiency per manager, a timeline of every bid in the draft, most-contested players, biggest bargains and overpays; the recap card's highlights made explorable in depth |
| Squad export checklist | A clean per-manager list of exactly which player to move to which club in FC 26/27 Team Management, turning the manual setup step into a checklist |
| Spectator/TV view | A separate big-screen view of the live draft board, useful if the group has a TV going during draft night |
| Multi-night leaderboard | Tracks results across repeated draft nights — who's built the best-value squad over time |

Confirmed for the build: the countdown timer per quote (paired with the one-hour draft clock), the squad + formation view, challenge history, the draft recap card, and complete analytics. The challenge-limit tracker and live budget bars are worth adding alongside them, since they make the caps and the season-carryover budget visible in the room instead of just remembered. The squad export checklist, spectator/TV view, and multi-night leaderboard remain optional polish for a later pass — though the leaderboard fits naturally once seasons are carrying budget forward.

## Mock draft night

A full hour replayed against every rule as it stands now — increment-based defense, listed-value sales, continuous multi-way bidding, and the overcommitment fine — to see where it holds and where it doesn't. All five clubs open with 250M spendable (the other 250M stays reserved for their existing squad, player by player).

| Clock | Event | Outcome |
| --- | --- | --- |
| 0:00–0:09 | Mbappé (200M listed, Real Madrid's). Barcelona opens 220M, Real Madrid raises 230M, Arsenal joins at 245M, Real Madrid raises to 250M | Both challengers are now capped at their own 250M spendable ceiling and can't exceed Real Madrid's 250M. Silence for 5 minutes closes it — Real Madrid retains him, paying only the 50M increment above his listed value |
| 0:00–0:05 (parallel) | Kane (100M listed, Bayern's). City opens 101M, Bayern doesn't raise | Silence closes it — City signs Kane for the full 101M; Bayern's listed 100M is released back into their own spendable |
| 0:00–0:05 (parallel) | Arsenal picks pool player Wirtz (60M), uncontested | Straight signing, full 60M from Arsenal's spendable |
| 0:05–0:10 (parallel) | City challenges Barcelona for Pedri (60M listed) at 90M, uncontested | Closes in City's favor at 90M, full price, pending City's available budget |
| 0:05–0:10 (parallel) | City also challenges Bayern for Musiala (70M listed) at 80M, uncontested | Also closes in City's favor at 80M — but see below |
| 0:10 | Both City deals try to finalize | Pedri closes first: City pays 90M (149M → 59M spendable). Musiala then can't be covered — 59M short of 80M — so that deal is voided, Musiala reverts to Bayern untouched, and City takes the 25M overcommitment fine (59M → 34M spendable) |

**Budget snapshot at the hour mark**

| Club | Spendable start | Spendable end | What happened |
| --- | --- | --- | --- |
| Arsenal | 250M | 190M | Picked up Wirtz from the pool; joined the Mbappé fight but got capped out |
| Bayern | 250M | 350M | Lost Kane and banked his listed value; kept Musiala when City's deal was voided |
| Real Madrid | 250M | 200M | Retained Mbappé for just the 50M increment above his listed value |
| Barcelona | 250M | 310M | Lost the Mbappé fight (spent nothing); lost Pedri to City and banked his listed value |
| Manchester City | 250M | 34M | Signed Kane and Pedri outright, then ate a 25M fine trying to close a second deal it couldn't afford |

**What this shows.** Incumbents have a real home-field advantage — Real Madrid kept Mbappé for a fraction of his listed value while both challengers hit their own budget ceiling first, purely because defending only costs the increment. That's not a bug, it's the mechanic working as designed, and it's exactly why the 3-challenges-per-rival cap still matters: spreading challenges across several of a rival's players at once is the realistic way to actually stretch a well-funded incumbent thin, not out-bidding them on one player outright. The listed-value sale rule gave both Bayern and Barcelona a bigger war chest than they started with despite losing a player each, and City's double deal shows the overcommitment fine doing its job — reaching for two signings at once without the budget to back both turned into real, measurable pain rather than a free option.
