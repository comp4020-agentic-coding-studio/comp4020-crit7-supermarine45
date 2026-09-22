# ANU Residence Explorer

ANU publishes its 19 undergraduate and postgraduate residences as 19 separate,
static pages under [Our Residences](https://study.anu.edu.au/accommodation/our-residences),
with no way to see them together, compare prices or catering side by side, or
tell where any of them actually sit relative to the city, the shuttle, or each
other. This prototype pulls the public content of those pages into one small
app that a prospective resident can actually search, filter, and place on a
map — plus a personal shortlist, hall-matching against their own preferences,
reviews from other residents, and quick links straight through to the real
StarRez application page for whichever hall they land on.

It reads ANU's own public listing and public geodata only. It does **not**
touch ANU's real StarRez housing portal (`anucomb.starrezhousing.com`) — that
system is out of scope and I have no authorisation to integrate with it. Every
"Apply now" link on this site is just the same public StarRez URL that already
sits on ANU's own page for that residence; clicking it hands off entirely to
ANU's real system. The account system added this round is likewise entirely
**native to this app** — its own username/password login, its own sessions —
not a StarRez-styled clone and not connected to ANU's real login in any way;
see "Accounts" under "What good looks like here" below.

## What's here

- **An interactive map** (`/`, and a zoomed-in copy on every residence page) —
  Leaflet over OpenStreetMap tiles, plotting all 19 residences, the nearest
  bus stops/supermarkets/cafés/bike parking for each (from OpenStreetMap via
  the Overpass API), and the full [ANU Civic Loop shuttle](https://sustainability.anu.edu.au/news/anu-civic-loop-bus-route-update-17-august-2026)
  route with its 12 active stops. Each residence page names its nearest
  shuttle stop, its nearest real public bus stop, and its nearest bike
  parking, each with the straight-line distance to it.
- **Search, sort & filter** (`/search/`) — results are per **room**, not per
  residence ("Room name — in Residence name"), so two rooms in different
  halls sit next to each other instead of one residence card hiding behind
  its cheapest room. Filter by resident type (undergrad/postgrad/both),
  catering style, weekly rate range, a free-text match against name and
  description, minimum review rating, and distance to the nearest Civic Loop
  shuttle stop; sort by name, price, rating, or shuttle distance. Every card
  shows its average rating and distance to the nearest stop so the
  sort/filter it was chosen by is visible, and carries a one-click "Apply
  now" straight to that residence's real ANU/StarRez application page, a
  "Save to shortlist" button, and an "Add to compare" checkbox.
- **Compare rooms side by side** (`/compare/`) — tick rooms on `/search/` and
  submit to see them side by side across price, contract length, catering,
  resident-type eligibility, rating, address, distance to the nearest
  shuttle stop, inclusions, and other fees. No login required: selection is
  a plain `?rooms=12&rooms=47...` query string, matching the no-JS-required,
  form-first convention every other filter/selection flow in this app
  already uses.
- **Quick start** (`/`) — five one-click cards above the residence grid:
  presets straight into a pre-filtered, pre-sorted `/search/` result
  (undergrad/postgrad cheapest-first, catered top-rated, near-shuttle
  nearest-first), plus a link into the hall-match questionnaire for a
  personalised ranking. Plain links, no client JS — so `/search/`'s own filter
  form loads with the matching filters already selected.
- **Accounts** (`/login/`, `/signup/`) — a native username/password login, not
  connected to ANU's real login or StarRez in any way. Everything below that's
  personal (shortlist, hall match, reviews, room interest) is tied to this
  account.
- **A shortlist** (`/shortlist/`) — saved residences persist server-side
  against your account, so they're still there after a reload, in a different
  tab, or on a different device, and stay private to you.
- **Hall matching** (`/hall-match/`) — save a budget range, catering, resident
  type and social preference, and get every residence ranked against it with
  plain-language reasons, not just a bare score.
- **Reviews** — on each residence's detail page, logged-in residents can rate
  and review a hall (one review per person, edited by resubmitting), and
  anyone can read the average rating and existing reviews.
- **Room interest** — a non-binding "I'm interested in this room type" toggle
  per room, showing a real cross-user count. Deliberately not a
  reserve/hold/booking flow — see the judgement call below.
- **A detail page per residence** (`/residences/[slug]/`) — a photo gallery
  and a room-type tab set (CSS-only, no client JS) showing each room type's
  weekly tariff, contract length, inclusions and other fees side by side,
  mirroring the structure of ANU's own per-residence pages.

## What good looks like here

Good, for this app, means: someone deciding between ANU residences can answer
"which of these are near a shuttle stop, in my price range, and take
postgrads" without opening 19 tabs — and can get from that answer straight to
the real application form.

Judgement calls I made, not enforced by any check:

- **Accounts are native to this app**, not a StarRez integration: usernames
  and passwords hashed with Node's built-in `scrypt` (no new dependency), and
  DB-backed sessions via a cookie. No email, no password reset, no
  lockout/rate-limiting — deliberately minimal for a one-week prototype where
  the point is modelling a person-to-place relationship, not building a
  production auth system. This replaced last round's shortlist, which had no
  login and was a single shared, anonymous list; that trade-off no longer
  applies now that every visitor can have their own account, and the
  migration that added `users`/`sessions` drops those old anonymous shortlist
  rows outright rather than inventing an owner for them (see
  `drizzle/0002_lean_speed.sql`).
- **Room interest is a non-binding "I'm interested" flag, not a
  reservation.** It would be easy to make this look like holding or booking a
  room, but this prototype has no connection to ANU's real StarRez system and
  can't actually hold anything — showing a real, aggregate "N people
  interested" count is an honest signal instead of a fake one.
- **Hall matching's "social" score prefers a real reviewer answer, and
  estimates only where there isn't one yet.** ANU's residence pages state
  catering style but nothing like a social/culture attribute, so there was
  nothing to compare a "social expectations" preference against. The review
  form now asks an optional "how would you describe the social atmosphere?"
  question (`reviews.social_vibe`); `src/lib/match.ts` uses each residence's
  most common answer when at least one reviewer has given one, and only falls
  back to its old catering-based proxy (self-catered → quiet, catered →
  social, flexi-catered → balanced) for a residence with none yet — every
  match reason says which of the two it used, rather than presenting either
  as something ANU stated.
- **OSM/Overpass data was fetched once, by hand, into `seed/*.json`**
  (`scripts/fetch-geo.ts`), not queried live at request time or at boot. Both
  Nominatim and the public Overpass mirrors rate-limit aggressively and are
  not something I want this app's uptime depending on; a location doesn't
  move often enough to justify a live dependency on a third party's free
  tier. Re-running that script is the deliberate way to refresh it.
- **Geocoding is approximate.** Coordinates come from Nominatim resolving each
  residence's street address and each shuttle stop's street description (ANU's
  own announcement names stops by street corner, not by coordinate) — expect
  building-scale, not doorway-scale, accuracy.
- **"Location filtering" means distance to a shuttle stop, not a suburb
  field.** ANU's residence pages don't publish a suburb/area attribute, and I
  didn't want to invent a taxonomy or add a live geocoding dependency (see the
  next judgement call) just for search. Every residence already has lat/lon
  and every shuttle stop does too, so the distance filter/sort reuses that —
  `src/lib/geo.ts`'s `haversineMeters`, shared with the per-residence "nearest
  shuttle stop" line that already existed.
- **Compare selection is a stateless URL, not a second account-backed
  list.** The shortlist already models "residences I've saved"; a compare
  list is a different, session-scoped idea ("what am I looking at right
  now"), and this app has no anonymous-state mechanism anywhere else to
  justify adding one just for this. Each room card's "Add to compare"
  checkbox uses the HTML5 `form="compare-form"` attribute to associate itself
  with a `<form>` that lives outside the card — the card already has its own
  shortlist `<form>`, and nesting a second `<form>` inside it is invalid
  HTML, so this was the standard way to let one checkbox submit into a form
  it isn't physically inside.
- **Residence photos are hotlinked to ANU's own site, not downloaded.** The
  building photography is ANU's copyrighted content; `imageUrl` in
  `seed/residences.json` points straight at each photo's real URL on
  `study.anu.edu.au`, so a visitor's browser fetches it from ANU directly and
  this app never stores or redistributes a copy of it.

What's enforced by `spec/`:

- The shipped invariants (nav landmark, one `h1`, language, viewport, alt
  text, an axe-core accessibility pass) on every route in `spec/routes.ts`.
- `spec/residence-explorer.test.ts`: the search filters actually narrow
  results (by resident type, catering, price, and keyword) against known
  facts in the seed data, every quick-apply link is a real external link
  opened safely (`target="_blank" rel="noopener"`), the map carries real
  coordinates for every residence and the whole shuttle route, unknown
  residence slugs 404 instead of crashing, a shortlisted residence is still
  shortlisted on a later, independent request after being saved and gone
  after being removed, one user's shortlist stays private from another
  logged-in user, and a logged-out visitor gets a login prompt instead of
  anyone's saved list. It also covers sorting (alphabetical by default, and
  correctly by price at either end of the seed data's known range), the
  shuttle-distance filter actually narrows results, and the review-rating
  filter only surfaces residences that clear the threshold. It also proves
  the home page's five quick-start cards are real, working links: each
  `/search/` preset returns a non-empty result and lands with its filters
  already selected in the form, and one card points at `/hall-match/`. It
  also covers `/compare/`: two selected rooms render side by side with a
  price cell each, no `rooms` param shows the empty state with a link back
  to `/search/`, an unknown room id is silently dropped rather than
  erroring, and every search room card carries a compare checkbox wired to
  the shared `#compare-form`.
- `spec/auth.test.ts`: signup logs the new user in immediately, a duplicate
  username is rejected without a 500, a wrong password is rejected, and
  logging out actually invalidates the session rather than just clearing the
  cookie client-side.
- `spec/reviews-and-room-interest.test.ts`: a logged-in review post appears
  with its rating and body and resubmitting edits it instead of duplicating;
  an unauthenticated review post redirects to login instead of creating a
  row; the optional social-atmosphere answer shows alongside a review;
  room-interest toggling moves the shared count up and back down, and is a
  login link (not a button) when logged out.
- `spec/hall-match.test.ts`: a flexi-catering preference ranks Wright Hall —
  the seed data's one flexi-catered residence — first; a logged-out visitor
  is redirected to login instead of seeing the questionnaire; and a real
  reviewer's social-atmosphere answer overrides the catering-based estimate
  in a match's reasons for that residence.
- `spec/cost.test.ts`: `parseContractWeeks`/`parseFeeAmount`/
  `estimateAnnualCost` as pure-function unit tests against real seed-data
  rooms — Burton & Garran Hall's Standard room resolves to a real total that
  separates one-off fees from the refundable deposit, and John XXIII
  College's tbc-rate room resolves to `null` rather than a fabricated
  number. `spec/residence-explorer.test.ts` also asserts University House's
  detail page renders its `applyNote` link with no "Apply now" button, a
  residence page names its nearest real public bus stop, `/compare/`'s
  "Estimated cost for the year" row renders a real value or the tbc fallback
  for every compared room, and the `PolicyNote` component's no-pets fact
  appears on both `/search/` and a residence detail page.

## Data & sources

| Data | Source | How it's used |
| --- | --- | --- |
| Residence names, blurbs, catering, accessibility notes, features, official Apply link (or, for University House, its non-StarRez `applyNote`) | Each residence's own page under [study.anu.edu.au/accommodation/our-residences](https://study.anu.edu.au/accommodation/our-residences) | Hand-transcribed once into `seed/residences.json` |
| Room types, weekly tariffs, contract lengths, inclusions & other fees | Each residence's own "Room options & fees" tab table, same ANU pages | Transcribed into the `rooms` array per residence in `seed/residences.json`, upserted into `residence_rooms`; rendered as the CSS-only room-type tabs on each residence page, alongside an estimated total cost computed by `src/lib/cost.ts` |
| Residence banner & gallery photos | The same ANU pages, linked directly (`study.anu.edu.au/files/...` and `imagedepot.anu.edu.au/...`) — not downloaded or re-hosted | `imageUrl` in `seed/residences.json` for the banner, and the `gallery` array (upserted into `residence_gallery_images`) for each residence's photo grid; the browser fetches every image straight from ANU's own server |
| Home page hero photo | ANU's own residences-listing hero image (`imagedepot.anu.edu.au/isfs/banner/our-residence-banner.jpg`) | Linked directly in `src/pages/index.astro`, same hotlinking approach as the residence photos above |
| No-children/no-pets policy | ANU's [family accommodation](https://study.anu.edu.au/accommodation/family-accommodation) page and its Occupancy Agreement/moving-in checklist | Static text in `src/components/PolicyNote.astro` — true for every residence, not seed-data-driven |
| Residence coordinates | [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) geocoding each residence's published street address | `scripts/fetch-geo.ts`, written to `seed/residences.json` |
| Nearby bus stops, supermarkets, cafés, bike parking | [OpenStreetMap Overpass API](https://overpass-api.de/) | Same script, written to `seed/nearby-places.json` |
| ANU Civic Loop shuttle route & stop order | ANU's own announcement, [ANU Civic Loop bus route update, 17 August 2026](https://sustainability.anu.edu.au/news/anu-civic-loop-bus-route-update-17-august-2026) | Stop names and sequence hand-transcribed; coordinates geocoded the same way, written to `seed/shuttle-stops.json` |

None of this is queried live — see "What good looks like here" above for why.

## Recommendations: what ANU's page doesn't tell you

Putting all 19 residences' published content side by side surfaced gaps that
are easy to miss reading one page at a time. This section was originally
written the round this app was first built; a later round went back to ANU's
real site for each point, live, to check which of these were still just
recommendations and which this app could actually go fix without touching
ANU's real StarRez system. Six were fixable; two turned out to be honestly
out of reach; two stay exactly as originally recommended, now with the real
supporting facts instead of a guess.

1. **Fixed.** No way to compare residences at all was the starting gap — 19
   independent pages, no shared table, filter, or map. `/search/`, `/compare/`
   and the home page's map are what this whole prototype exists to build.
2. **Fixed.** Public transport isn't mentioned on ANU's residence pages at
   all — only the Civic Loop shuttle, on a separate sustainability news post
   nothing on the accommodation site links to. Every residence page here now
   also names its **nearest real public bus stop**, sourced independently
   from [OpenStreetMap via the Overpass API](https://overpass-api.de/) rather
   than from ANU's shuttle route, so it holds even for a resident who won't
   use the shuttle at all.
3. **Fixed, with one honest residual.** Rates are quoted per week but
   contract lengths differ (44 weeks, 43.57 weeks, full-year), and one-off
   fees (registration, committee, refundable deposit) sat in free text
   alongside the rate rather than in it — no residence page stated a
   total-cost-of-year figure. Every room here now shows an **estimated cost
   for the full contract** (`src/lib/cost.ts`'s `estimateAnnualCost`: rent ×
   contract weeks, plus one-off fees, with refundable deposits and advance
   rent called out separately so they aren't double-counted), on the detail
   page, on `/compare/`, and as a short line on every search result card.
   John XXIII College's own page states its rate as "tbc" — confirmed still
   true by direct fetch — so its estimate honestly reads "can't be estimated"
   rather than inventing a number ANU hasn't published.
4. **Fixed, with one honest residual.** Accessibility information was present
   for some residences (Burton & Garran Hall: "no lifts, stairs-only access")
   and silent for most. This was already handled correctly by the time of
   this round's audit — `accessibilityNote` renders "Not stated on the ANU
   residences page" rather than silence for every residence without one,
   including John XXIII College, whose own ANU page still says nothing about
   lift access or step-free entry (confirmed by direct fetch this round).
   That's the one honest residual here: this app can't state what ANU itself
   hasn't published.
5. **Out of reach, now explained.** Live vacancy/waitlist status lives
   entirely inside StarRez, which is out of scope for this prototype by
   design (see the top of this README). What direct fetch of ANU's own pages
   *did* surface this round: ANU runs a rolling-offer/guarantee process
   rather than a fixed open/closed window per residence, so even an
   "applications open/closed" flag would misrepresent how the real process
   actually works — this isn't just a missing field, it's a genuinely
   different application model than the one this recommendation assumed.
6. **Fixed.** Internet, laundry and utility costs previously appeared only as
   a bare feature-list bullet, with no cost or inclusion detail. Where ANU's
   own per-residence fee tables state a laundry/internet fee or an inclusion
   explicitly, that's exactly what `otherFees`/`inclusions` in
   `seed/residences.json` already carries verbatim onto each room's rate
   table — the gap was that this data existed but the total-cost picture
   didn't (see point 3, which is the actual fix); where ANU's page states
   nothing about a specific utility, this app doesn't invent an inclusion.
7. **Fixed.** No bike parking or bike-route information, despite Canberra
   being bike-friendly and ANU promoting cycling. Every residence page now
   also names its **nearest bike parking**, sourced the same way as the bus
   stop fix (point 2): OpenStreetMap Overpass, `amenity=bicycle_parking`,
   within 400m. Most OSM bike-rack nodes carry no name, which the UI shows
   honestly as "unnamed rack" rather than fabricating one.
8. **Out of reach, now explained.** Gallery photos aren't tied to the room
   type they illustrate. Direct fetch of ANU's own Lena Karmel Lodge page
   this round confirmed this is exactly how ANU still presents it: one flat,
   unlabelled gallery per residence, no per-room-type photo or floor plan
   anywhere in the source. This app hotlinks those same gallery images (see
   "Residence photos are hotlinked" above) and has no independent photo
   source to tag by room type, so this stays a real gap on ANU's side that a
   downstream consumer of the same public page can't fix.
9. **Partly fixed, partly stays a stated gap.** Two of the three sub-points
   here are now answered with real facts rather than silence: ANU's family
   accommodation page states its residences "are not suitable for children
   and no facilities for children are provided," and ANU's Occupancy
   Agreement and moving-in checklist both state pets/animals aren't permitted
   in any residence — both now shown on every residence page and on
   `/search/` via a shared `PolicyNote` component (`src/components/
   PolicyNote.astro`), rather than repeating two ANU-wide facts 19 times in
   seed data. The third sub-point — an LGBTQ+-inclusive or quiet/wellness
   floor designation — genuinely doesn't exist anywhere in ANU's published
   content for any residence, confirmed by this round's search; `PolicyNote`
   says so directly instead of staying silent about it.
10. **Fixed.** University House had no direct online application link on its
    public page — confirmed by direct fetch: no StarRez link at all, only a
    phone number, an email address, and a link to its own
    `unihouse.anu.edu.au` accommodation page. That's a genuinely different,
    non-StarRez process, not an oversight or a gap this app can paper over —
    so University House now carries an `applyNote` field instead of an
    `applyUrl`, and its card/detail page render that note (with its own link
    made clickable) exactly where every other residence shows an "Apply now"
    button.

Two judgement calls behind these fixes:

- **`applyNote` is a fallback, not a second copy of `applyUrl`.** Every UI
  location that renders "Apply now" (`[slug].astro`, `ResidenceCard.astro`,
  `RoomCard.astro`) now checks `applyUrl` first and only falls back to
  `applyNote` when it's absent, so University House's different process
  shows up as a different, honest call-to-action rather than either a blank
  space or a StarRez button that doesn't exist for it.
- **Estimated cost is a documented, narrow parser, not a general money
  parser.** `parseFeeAmount`/`parseContractWeeks` in `src/lib/cost.ts` only
  understand the handful of free-text shapes that actually appear in this
  app's own seed data (`"$1,300"`, `"44 weeks"`, `"2 weeks rent: tbc"`) —
  broad enough to cover every real room in `seed/residences.json`, narrow
  enough that a shape it doesn't recognise fails safely to `null` ("can't be
  estimated") rather than silently mis-parsing into a wrong number.

One earlier lead from this round's research is deliberately **not** reflected
above: a web search suggested Graduate House reserves a specific number of
rooms for student partners/families. A direct fetch of Graduate House's own
current ANU page found no such figure — only a generic "Studio Double (double
occupancy)" room type, no partner-billing text, no room count. That claim is
dropped rather than shipped; see the Round 8 entry in `PROCESS.md` for the
full account of catching it.

Everything above that's still marked "fixed" is backed by either data already
in `seed/residences.json`/`seed/nearby-places.json`, or by a direct fetch of
the cited ANU page — never by an uncorroborated search-result summary.
