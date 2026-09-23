# Process overview

## What I built

**ANU Residence Explorer** — the full-stack replacement I wish existed for
ANU's own [residences listing](https://study.anu.edu.au/accommodation/our-residences),
which splits 19 halls, lodges and colleges across separate static pages with no
way to compare them, search them, or see where any of them actually sit in
Canberra. It brings all 19 into one searchable, sortable, filterable, mapped
view, and adds the relationships a real housing decision actually needs:
accounts, a hall-matching questionnaire, resident reviews, a non-binding
room-interest signal, and a shortlist tied to your account instead of shared
anonymous state. It deliberately does not touch or imitate ANU's real
`anucomb.starrezhousing.com` StarRez system — that boundary is stated in
`README.md` and held throughout every round of this build.

## How I got here

**Round 1 — scaffold.**
[`28c8bd3`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-supermarine45/commit/28c8bd346d17c2548bcd7e371412c12e8d7e0166)
settles the repo onto the course's Astro + Drizzle + SQLite starter.

**Round 2 — the core slice.**
[`59f4e17`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-supermarine45/commit/59f4e17af698a6526d3b5476596a8c6a77d5bf1b)
builds the data model (residences, room types, features, gallery, nearby
places, shuttle stops), the Leaflet/OpenStreetMap overview map, keyword/type/
catering/price search, a first shortlist, and per-residence detail pages —
each backed by `spec/residence-explorer.test.ts` asserting the contract
(exact result counts against known seed-data facts, working apply links, real
geodata on the map, a 404 for an unknown slug) rather than implementation
details.

**Round 3 — relationships between people and places.**
[`15ecc52`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-supermarine45/commit/15ecc52b21a4b4a257ca4d2805683aef0150c119)
adds native accounts (scrypt-hashed passwords, DB-backed sessions — no
StarRez-styled clone, no third-party auth), a hall-matching questionnaire that
scores residences against budget/catering/resident-type/social preferences,
authenticated reviews, a room-interest toggle framed explicitly as "not a
booking or hold, just a signal" (this project held that line last round too —
a real StarRez hold isn't something this prototype can honestly offer), and
migrates the shortlist from a single shared anonymous list to one row per
`(userId, residenceId)`. `spec/auth.test.ts`, `spec/hall-match.test.ts` and
`spec/reviews-and-room-interest.test.ts` land alongside it, plus a rewritten
shortlist test proving one user's saved residences stay private from another.

**Round 4 — search, sort, filter, and a map that actually scales (this
round).** Prompted with:

> add better search options include sorting, location filtering, review
> filtering, and more

I added five sort orders (name, price either direction, rating, nearest
shuttle stop), a location filter (distance to the nearest ANU Civic Loop
stop — there's no suburb field on ANU's own pages to filter by, so this reuses
the shuttle-stop geodata already on the map, documented as a judgement call in
`README.md`), a minimum-rating filter, and rating/distance badges on every
card. The Haversine distance calculation was already duplicated once (the
residence detail page's "nearest shuttle stop" line); I pulled it into
`src/lib/geo.ts` so search filtering and the detail page share one
implementation instead of two. Review stats moved from a per-residence query
to one batched, grouped query (`getAllReviewStats`) reused across the search,
home and shortlist pages, avoiding 19 separate queries per page load.

The next prompt was a bug report:

> The sorting does not work yet. Also, ensure the map scales correctly and
> works for every page.

Rather than assume either "the code is wrong" or "the deployment is stale," I
checked both. I rebuilt the app locally and curled `/search/` under
`?sort=price_desc`, `?sort=price_asc`, and no sort param, cross-checking the
ordering against known seed-data facts (Burgmann College is the one $629/wk
residence, Burton & Garran Hall the one $319/wk residence, and John XXIII
College — the one residence with no published rate — correctly sorts last
under both directions). The backend was correct. I then curled the *deployed*
`https://comp4020-crit7-supermarine45.fly.dev/search/` directly and confirmed
it still serves the pre-Round-4 markup (no `sort` field, no rating/distance
badges) — this round's work had never been pushed or deployed, so the
sorting the report described was the old build, not this one. That's fixed by
shipping this round rather than by changing any sort logic.

The map report was real, though: `src/components/Map.astro` measured its
Leaflet container's size exactly once, at `L.map()` init, and never again. A
window resize, an orientation change, or any layout reflow after that point
left the tile grid stale — grey or cut-off tiles, not a map that "scales."
I added a `ResizeObserver` on the container (falling back to a `resize`
listener) calling `map.invalidateSize()` on every observed size change, plus
one initial `requestAnimationFrame` call to cover layout not yet settled at
init. This fixes it on both places the map appears — the home page's overview
map and every one of the 19 residence detail pages' small map — rather than
adding a map to a new page, since neither instance had ever been broken by a
missing map, only by a missing resize hook.

I also audited the app against this deliverable's published spec line by line
using `pnpm check:evidence`, which caught this file still being the unfilled
template and `reflections/crit-7.md` not existing at all — both spec
requirements, not implementation details. This file and that reflection are
the fix.

**Round 5 — an accessible way to apply filters, and a real question instead
of a proxy.** Prompted with two specific improvement ideas from that audit:

> Implement this: Consider an accessible way to apply and The hall-matching
> "social" axis is inferred from catering style (documented in README) —
> could be strengthened later with a real question in the questionnaire
> instead of a proxy.

For the first: the search filters previously only applied on a full page
navigation via the "Filter" button — correct, but not the best a keyboard or
screen-reader experience could be. The tempting shortcut, auto-submitting the
form on every `<select>`'s `change` event, is a real WCAG 3.2.2 (On Input)
failure (Failure Technique F36): cycling a *closed* `<select>` with arrow keys
fires `change` on every keypress in most browsers, so that shortcut would
reload the page out from under a keyboard user on every arrow press. Instead
`search.astro` now progressively enhances the same form: a debounced
`fetch()` re-requests `/search/` with the current filter values and swaps in
only the new results, updating the existing `aria-live="polite"` count node's
*text* (never replacing the node itself, so assistive tech reliably announces
it) and a separate, non-live results container (so a filter change doesn't
read out every card in the grid). No navigation, no stolen focus — Success
Technique SCR19 covers exactly this shape of in-place `onchange` update. The
plain GET form remains fully intact underneath as the no-JS fallback, which
is what `spec/residence-explorer.test.ts`'s search tests already exercise
(JSDOM doesn't execute `<script>`, so they never touch the new code path).

For the second: matching's "social" axis had a documented catering-based
proxy (self-catered → quiet, catered → social, flexi-catered → balanced) on
the *residence* side of the comparison — the user's own preference was
already a real, required questionnaire field, so the fix belonged entirely on
the residence side. The review form now carries an optional "how would you
describe the social atmosphere?" question (`reviews.social_vibe`, migration
`drizzle/0003_strong_ben_parker.sql`); `src/lib/match.ts` prefers a
residence's most common reviewer answer when at least one exists, and only
falls back to the catering-based estimate otherwise — every match reason
says which of the two produced it. `spec/hall-match.test.ts` covers the
override directly: a reviewer describes John XXIII College (catered — the
estimate would guess "social") as "quiet", and a `social: "quiet"` match
picks that real answer up instead.

**Round 6 — a quick-start path for someone who doesn't want to fill in a
search form first.** Prompted with:

> Make an 'quick start' interface to choose a hall

The home page already had two ways in — the full residence grid, and the
`/search/` form behind the "Search & filter" button — both of which ask a
first-time visitor to already know what they're filtering for. The home page
now opens with a "Quick start" section: five cards, each a plain link (no
JavaScript, no form) straight into a pre-filtered, pre-sorted `/search/`
result — undergrad or postgrad eligible sorted cheapest-first, catered halls
sorted top-rated, and halls within 1 km of an ANU Civic Loop stop sorted
nearest-first — plus a fifth, visually distinct card into `/hall-match/` for
someone who'd rather answer a few questions and get every hall ranked against
their own preferences instead of picking a single preset. Every preset's
query params (`type`, `catering`, `maxDistance`, `sort`) match values
`search.astro` already parses and its filter `<select>`s already enumerate,
so landing on `/search/` from a quick-start card shows the matching filters
already selected in the form, not just a matching result set.

**Round 7 — room-grained search, and a side-by-side comparison.** Prompted
with:

> The issue is the filter should be on a room to room bases. So the result
> should be: room X in accomodation Y to make it easier to compare between
> rooms. Could you also make an interface where we can compare each selected
> side by side in their features (price, location, etc) to make comparison
> easier?

`/search/` previously listed one card per *residence*, summarised by its
cheapest ("from") price — comparing actual room options meant opening each
residence's own detail page. `src/lib/db.ts` gained `searchRooms()` and
`getRoomsByIds()`, which join `residence_rooms` to `residences` and apply the
same filters (type, catering, price, keyword, rating, shuttle distance) at
room grain instead of residence grain; `min`/`max` now filter each room's own
`weeklyTariff` rather than a residence-level "from" price. A new
`RoomCard.astro` renders each result as "room X — in [residence Y]", still
carrying the existing shortlist button (shortlist stays a residence-level
concept — saving from any of a hall's rooms saves the whole hall) and its
quick-apply link. Sorting by price now ties across residences (five rooms
share the seed data's global-maximum $641), so the comparator gained an
explicit, documented tie-break (residence name, then room order) rather than
leaving the result order to depend on incidental row order.

For the comparison interface: rather than add a second, account-gated
selection list alongside the shortlist (more schema, more surface area, and
this app has no anonymous-state mechanism anywhere else to begin with), each
room card carries a "add to compare" checkbox that submits straight into a
new `/compare/?rooms=12&rooms=47...` page — no login, no new table, matching
the existing filter form's own GET-based, no-JS-required convention. The one
real HTML wrinkle: each room card already has its own shortlist `<form>`, and
nesting a second `<form>` inside it is invalid HTML — solved with the
standard `form="compare-form"` attribute, which associates the checkbox with
a `<form id="compare-form">` living outside the results list entirely. That
placement is deliberate for a second reason too: the existing progressive-
enhancement script swaps `#results-list`'s innerHTML on every filter change,
and keeping `#compare-form` outside that container means a filter change
never wipes it. The same script was extended a few lines to carry *ticked*
checkboxes across that swap, since without it a live filter change would
silently untick everything a visitor had already selected — the plain no-JS
path needs no equivalent fix, since without JS there's no in-place swap to
lose state across. `/compare/` itself degrades gracefully at both ends: no
`rooms` param shows an empty state linking back to `/search/`, and a stale or
hand-edited id that no longer resolves is silently dropped rather than
erroring.

**Round 8 — going back to ANU's real site to fix the recommendations this app
made about it.** Prompted with (condensed):

> Can you fix the following points? Search for these information from the
> internet (ANU website): [the 10-point "Recommendations: what ANU's page
> doesn't tell you" list from README.md] — no way to compare residences;
> public transport/shuttle distance missing from residence pages; pricing
> inconsistent and incomplete, no total-cost figure; accessibility info
> present for some, silent for most; no live vacancy/waitlist status; no
> internet/laundry/utility cost detail; no bike parking/route info; gallery
> photos not tied to room type; no couples/family/pet/LGBTQ+/quiet-floor
> info; University House has no direct application link.

First step was an audit, not a rewrite: that section was written the round
this app was first built, and two of its ten points (1, the comparison UI;
4's general "silence exists" observation) were already fully or partly solved
by features later rounds shipped — the README just hadn't been revisited to
say so. Rewriting it honestly meant checking each point against both the
current codebase *and* ANU's real site as it stands today, not just
rephrasing the original ten guesses.

The live research: direct `WebFetch` against University House's own ANU page
confirmed it carries no StarRez link at all, only a phone number, an email
address, and a link through to `unihouse.anu.edu.au`'s own accommodation
page — a genuinely different, non-StarRez process, not an oversight (fixes
point 10). The same direct-fetch approach against John XXIII College's page
confirmed its rate is still stated as "tbc" and its accessibility section is
still silent — both a real ANU-side gap, not something this app can fabricate
around (the residual half of points 3 and 4). `WebFetch` against ANU's family
accommodation page turned up the "not suitable for children... no facilities
for children are provided" line directly; `WebSearch` for ANU's pets policy,
followed by a direct fetch to confirm it against ANU's own Occupancy
Agreement/moving-in checklist wording rather than trusting the search
summary alone, confirmed no pets/animals are permitted in any residence
(point 9). A fetch of Lena Karmel Lodge's own gallery confirmed it's still
exactly the flat, unlabelled set of photos the original point 8 described —
this app hotlinks those same images and has no independent source to tag by
room type, so that point stays an honest, explained gap rather than a fixed
one.

One lead didn't survive that discipline and is worth recording as a caught
failure, not a footnote: an initial `WebSearch` for Graduate House's
accommodation returned a summary claiming it reserves a specific number of
rooms (something like "9 of 150") for student partners/families. Before
writing that number into `seed/residences.json`, I ran a direct `WebFetch`
against Graduate House's actual current ANU page — it names only a generic
"Studio Double (double occupancy)" room type, with no partner-billing text
and no room count anywhere. The search summary either hallucinated the
figure or was describing a page that no longer exists in that form. It's
dropped from this round entirely rather than shipped on the strength of a
search result alone — exactly the kind of thing a "corroborate with a direct
fetch before it becomes seed data" discipline exists to catch, and worth
naming here so it isn't quietly repeated next round.

What that research turned into, concretely: a new `applyNote` field
(`src/lib/schema.ts`, migration `drizzle/0004_steady_blur.sql`) so University
House's real process renders in place of a silently-missing "Apply now"
button, in `[slug].astro`, `ResidenceCard.astro` and `RoomCard.astro` alike.
Two new "nearest" facts per residence — a real public bus stop and the
nearest bike parking — both sourced by extending the existing OSM Overpass
pipeline in `scripts/fetch-geo.ts` with a fifth category
(`amenity=bicycle_parking`, 400m radius) rather than inventing a new data
source; re-running it live against `overpass-api.de` returned real,
frequently-unnamed bike-rack nodes for all 19 residences, which the existing
`?? "unnamed rack"` fallback already handled without a UI change. A new
`src/lib/cost.ts` turns each room's existing `weeklyTariff`, `contractTerm`
and free-text `otherFees` into a real total-cost-for-the-contract figure,
deliberately via narrow, documented regexes over the handful of shapes that
actually appear in this app's own seed data rather than a general money
parser — a shape it doesn't recognise (John XXIII College's "tbc" rate) fails
safely to "can't be estimated" instead of guessing, which is what makes it
trustworthy enough to put in `/compare/`, the detail page, and every search
card. And a new shared `PolicyNote.astro` component states the two
ANU-wide, now-confirmed policy facts once, on `/search/` and every detail
page, alongside an explicit, honest note that no LGBTQ+ or quiet-floor
designation exists anywhere in ANU's published content — naming a gap
outright is worth more here than staying silent about it.

One accessibility bug surfaced by the existing test suite while building
this, not by manual review: `PolicyNote.astro` originally used an `<h3>`, and
`spec/invariants.test.ts`'s axe-core pass on `/search/` failed with a
heading-order violation — `/search/` only has an `<h1>` before it, so jumping
straight to `<h3>` skips a level. Changed to `<h2>`, which is accurate on
both `/search/` (nothing else claims that level yet) and the residence detail
page (sitting among several existing `<h2>` siblings). This is exactly the
kind of thing `spec/invariants.test.ts` exists to catch before it ships, and
it did.

**Round 9 — grouping search results back to one card per hall, without losing
the room-level comparison Round 7 added.** Prompted with:

> instead of displaying all the available accomodation individually, I'd like
> to display only the hall. Then upon clicking, show the available options in
> that hall, and add option to compare.

Round 7 deliberately went the other way — one card per *room* — specifically
so rooms could sit side by side for comparison. This round asked for the
hall-level list back, but without giving up that comparison. The two aren't
actually in tension: `searchRooms()` already returns a flat, sorted
`RoomSearchResult[]` with every hall-level fact (rating, distance, catering,
resident type, apply link, shortlist) duplicated onto each room row, so
grouping it by `residenceId` in `search.astro` is pure presentation — no
schema change, no new query. Grouping by first-occurrence order for halls and
preserving each room's existing relative order within its hall reproduces
every existing sort's observable behaviour for free: `price_desc`'s first
hall card is still the one holding the single highest-priced room, because
that room's occurrence is what put its hall first in the grouped list.

The one real decision was how a hall's rooms get revealed: expand inline on
`/search/` (an accordion), or navigate to the hall's existing
`/residences/[slug]/` detail page. Navigating there would mean either
building a new cross-page compare-selection mechanism (this app has no
anonymous session/cart concept anywhere else) or losing the ability to
compare rooms *across* halls in one pass — a regression on what Round 7
shipped. Asked the user directly; they chose the inline accordion. A new
`HallResultCard.astro` (replacing `RoomCard.astro`, deleted) renders each
hall's shared facts once, with a native `<details class="hall-rooms">`
disclosure underneath listing that hall's actual room options — name, price,
estimated annual cost, and the same "add to compare" checkbox Round 7 added,
untouched down to the `name="rooms"` / `form="compare-form"` markup, so
`/compare/` needed zero changes. The disclosure is native HTML, not
JS-driven: the room list is present in the initial server-rendered response
(verified by fetching `/search/?catering=flexi_catered` directly and
confirming its one hall card's three rooms are already in the markup),
collapsed by default via CSS/browser default rather than requiring
JavaScript to appear at all.

`spec/residence-explorer.test.ts` needed a matching, but mostly mechanical,
rewrite: any assertion on a hall-level fact (resident type, catering, rating,
distance, shortlist, apply button) moved its selector from `.room-card` to
`.hall-card`, since that fact now renders once per hall instead of once per
room. Assertions on room-level facts (price, compare checkbox, plain room
counts) were untouched, since those stayed nested inside `.room-card`
exactly as before. One new test protects the disclosure behaviour directly:
a hall's `<details>` carries no `open` attribute, yet its `.room-card` rows
are already present underneath it — collapsed-by-default, not
absent-until-JS. Confirming that assertion was safe meant checking jsdom's
actual behaviour first: `.textContent` on a closed `<details>` still includes
its nested content, since collapsing is a rendering/accessibility-tree
behaviour, not a DOM-content removal — so the existing sort-order tests
(`cards[0].textContent` containing both a hall name and a nested room price)
kept working unchanged once their selector moved to `.hall-card`.

**Round 10 — a logged-in "my accommodation" area: a mock contract, its
remaining term, cancelling it, maintenance requests, contacting the
residence assistant, and a next-direct-debit-date widget.** Prompted with:

> if a user is logged in, I'd like to see a menu detailing the contracts
> (make a mock contract for an accommodation), remaining terms, cancelling
> contracts, maintenance request, and contact the residence assistant. Also,
> add a widget for the next direct debit date (dates are outlined here:
> [ANU's Direct debit dates 2026 PDF](https://d3gu8jtw4r0om.cloudfront.net/files/2026-07/Direct%20debit%20dates%202026_v5.pdf))

This app had no booking/contract concept before this round — accounts only
carried `shortlist`, `preferences`, `reviews` and `roomInterest`, and
`roomInterest` is explicitly documented as "not a reservation or hold." A
mock contract is genuinely new state, so it got two new tables
(`contracts`, `resident_requests` — the latter covers both a maintenance
request and an RA message, since they're the same shape: what it says,
submitted or withdrawn) rather than overloading `roomInterest`, but followed
the same account-scoped-feature pattern this app already uses four times
over: a Drizzle table with a cascade-delete FK to `users`, a function per
operation in `src/lib/db.ts`, a `POST`-only API route per mutation, and an
Astro page gated on `Astro.locals.user`.

Two decisions asked of the user directly rather than guessed:

- **"Contact the residence assistant" is an in-app mock message form, not
  fabricated contact details.** Inventing an RA email or phone number would
  read as real ANU contact information without being any — this app's
  accounts are already explicitly native and not a StarRez integration, and
  a made-up phone number would break that same discipline. The chosen
  option stores the message and lists it back, captioned prototype-only,
  the same shape as the maintenance-request list right next to it.
- **The room picker that creates the mock contract lives only on the new
  `/my-accommodation/` page**, not also bolted onto the residence detail
  page's existing room-interest UI — keeps the diff contained to one new
  page rather than touching `[slug].astro`'s already-established layout for
  a feature that only needs to exist in one place.

Sourcing the direct-debit dates from the PDF surfaced the same kind of
extraction anomaly Round 8 already had a rule for: a straight text pull of
the "billing period From/To" columns next to each debit date reads the first
two rows of each table's span *backwards in time*, which looks like a
table-extraction artefact rather than genuine ANU data. Rather than guess at
a fix, `src/lib/directDebit.ts` only hardcodes the debit-date column itself
— cross-checked by hand against the PDF's own year-at-a-glance calendar
graphic — and leaves the billing-period span out entirely. Same "don't ship
data you can't verify" call as `parseContractWeeks`/`estimateAnnualCost` in
Round 8. The PDF also turned out to publish two distinct fortnightly
schedules, "ANU Residences" and "ANU Lodges," that briefly coincide and then
diverge (Lodges bill on Wednesdays through mid-2026, Residences the day
after) — `isLodge()` picks the right one by checking for "Lodge" in the
residence's name, which matches exactly four of the nineteen seeded
residences (Davey, Kinloch, Warrumbul, and Lena Karmel Lodge) and nothing
ambiguously.

A planning assumption turned out to be wrong and is worth recording rather
than quietly dropping: the plan for this round's tests assumed John XXIII
College's room would be a real example of a `contractTerm` that fails to
parse into weeks (its rate is famously "tbc" — see Round 8), giving an
integration-test case for the "contract length not published" state a mock
contract can be in. Checking `seed/residences.json` directly before writing
that test found the opposite: John XXIII's `contractTerm` is "44 weeks" (it
parses fine) — the "tbc" is its *weekly tariff*, a different field, already
covered by the existing `estimateAnnualCost` fallback from Round 8. A full
sweep of every room in the seed data for a non-parsing `contractTerm` found
none at all. The code path itself is real and stayed (`setMyAccommodation`
leaves `endDate` null when `parseContractWeeks` returns null, and the page
shows "Contract length not published for this room type" for it), and it's
still unit-tested at the parser level (`spec/cost.test.ts` already asserts
`parseContractWeeks("tbc")` is `null`) — but the planned integration test
for it was dropped rather than kept against seed data that can't actually
exercise it.

Cancelling a contract doesn't delete its row — it flips `status` to
`cancelled` and stamps `cancelledAt`, the same "keep history, don't erase
it" choice `upsertReview` doesn't need to make (reviews don't have a
history concept) but `roomInterest`'s toggle-on/off doesn't either (there's
nothing to look back on). A contract does have something worth keeping: the
new "Past accommodation" list on `/my-accommodation/` reads directly off
those cancelled rows.

**Round 11 — a "View contract" document, and turning one-click
cancellation into a signed Notice of Cancellation.** Prompted with:

> add one more option to view the contract

and, mid-turn, expanded to:

> and create a document (to sign, etc) with a whole process for when the
> user would like to cancel the contract

Round 10 shipped `cancelMyContract` as a single POST with no confirmation
step — appropriate for a mock, but not a fair model of what cancelling a
real housing contract feels like, which is exactly what the second prompt
called out. Two new pages, both dynamic routes on the same `contracts.id`:

- `/contract/[id]/` — the full contract rendered as a document (resident,
  property, tariff, term, dates), scoped by `getContractById(userId, id)`
  so a contract can only be opened by the user who holds it (404
  otherwise, following `/residences/[slug].astro`'s existing 404
  convention for an unresolved dynamic route). Deliberately *not* a
  separate "cancelled" page: the same document doubles as the
  cancellation receipt once `status` flips, showing `cancelledAt` and the
  stored signature instead of the "cancel this contract" link. One page
  that changes state, rather than two pages that could drift apart.
- `/contract/[id]/cancel/` — a "Notice of Cancellation" the resident has
  to read and sign: a required acknowledgement checkbox and a required
  typed-name signature field, both enforced by the same
  native-`required`-attribute-first, server-side-defense-in-depth
  convention this app already uses on the maintenance/RA-message forms.
  `/api/contract/cancel` now refuses to cancel without both fields present
  — a bare POST silently no-ops instead of erroring, matching
  `requests/add.ts`'s existing "invalid input redirects without mutating"
  pattern — which is a genuine, intentional breaking change to the old
  API contract, not an oversight: the old one-click "Cancel contract"
  button on `/my-accommodation/` was replaced with a link to the new
  sign-flow page in the same round, so nothing in the shipped app still
  posts the old bare request.

The signature itself is persisted (a new `cancellationSignature` column on
`contracts`, added via a Drizzle migration same as every other schema
change), not treated as UI-only theatre — the user's ask for "a document
(to sign, etc)" reads as wanting a real record of who signed and when, and
the receipt view on `/contract/[id]/` is exactly that record played back.

`formatDate`/`remainingTermLabel` moved out of `my-accommodation.astro` and
into a new `src/lib/contractFormat.ts` so the contract card and the new
document view can't drift into disagreeing about what a date or a
remaining-term string reads as — the same de-duplication `cost.ts`,
`directDebit.ts` and `geo.ts` already exist to enforce elsewhere in this
app.

## Before you ship

`pnpm check` (typecheck + `astro build` + the full `vitest` suite, 171 tests
across 10 files) is green. `pnpm check:evidence` passes once this round's
changes are committed — see the latest commit range in this repo's history
for the diff described above.
