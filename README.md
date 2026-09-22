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
  bus stops/supermarkets/cafés for each (from OpenStreetMap via the Overpass
  API), and the full [ANU Civic Loop shuttle](https://sustainability.anu.edu.au/news/anu-civic-loop-bus-route-update-17-august-2026)
  route with its 12 active stops. Each residence page names its nearest
  shuttle stop and the straight-line distance to it.
- **Search & filter** (`/search/`) — by resident type (undergrad/postgrad/both),
  catering style, weekly rate range, and a free-text match against name and
  description. Every result carries a one-click "Apply now" straight to that
  residence's real ANU/StarRez application page, and a "Save to shortlist"
  button.
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
- **Hall matching's "social" score is an estimate, not an ANU-published
  fact.** ANU's residence pages state catering style but nothing like a
  social/culture attribute, so `src/lib/match.ts` maps catering style to a
  rough quiet/balanced/social proxy (self-catered → quiet, catered → social,
  flexi-catered → balanced) and says so in every match reason it shows,
  rather than presenting it as something ANU stated.
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
  anyone's saved list.
- `spec/auth.test.ts`: signup logs the new user in immediately, a duplicate
  username is rejected without a 500, a wrong password is rejected, and
  logging out actually invalidates the session rather than just clearing the
  cookie client-side.
- `spec/reviews-and-room-interest.test.ts`: a logged-in review post appears
  with its rating and body and resubmitting edits it instead of duplicating;
  an unauthenticated review post redirects to login instead of creating a
  row; room-interest toggling moves the shared count up and back down, and
  is a login link (not a button) when logged out.
- `spec/hall-match.test.ts`: a flexi-catering preference ranks Wright Hall —
  the seed data's one flexi-catered residence — first, and a logged-out
  visitor is redirected to login instead of seeing the questionnaire.

## Data & sources

| Data | Source | How it's used |
| --- | --- | --- |
| Residence names, blurbs, catering, accessibility notes, features, official Apply link | Each residence's own page under [study.anu.edu.au/accommodation/our-residences](https://study.anu.edu.au/accommodation/our-residences) | Hand-transcribed once into `seed/residences.json` |
| Room types, weekly tariffs, contract lengths, inclusions & other fees | Each residence's own "Room options & fees" tab table, same ANU pages | Transcribed into the `rooms` array per residence in `seed/residences.json`, upserted into `residence_rooms`; rendered as the CSS-only room-type tabs on each residence page |
| Residence banner & gallery photos | The same ANU pages, linked directly (`study.anu.edu.au/files/...` and `imagedepot.anu.edu.au/...`) — not downloaded or re-hosted | `imageUrl` in `seed/residences.json` for the banner, and the `gallery` array (upserted into `residence_gallery_images`) for each residence's photo grid; the browser fetches every image straight from ANU's own server |
| Home page hero photo | ANU's own residences-listing hero image (`imagedepot.anu.edu.au/isfs/banner/our-residence-banner.jpg`) | Linked directly in `src/pages/index.astro`, same hotlinking approach as the residence photos above |
| Residence coordinates | [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) geocoding each residence's published street address | `scripts/fetch-geo.ts`, written to `seed/residences.json` |
| Nearby bus stops, supermarkets, cafés | [OpenStreetMap Overpass API](https://overpass-api.de/) | Same script, written to `seed/nearby-places.json` |
| ANU Civic Loop shuttle route & stop order | ANU's own announcement, [ANU Civic Loop bus route update, 17 August 2026](https://sustainability.anu.edu.au/news/anu-civic-loop-bus-route-update-17-august-2026) | Stop names and sequence hand-transcribed; coordinates geocoded the same way, written to `seed/shuttle-stops.json` |

None of this is queried live — see "What good looks like here" above for why.

## Recommendations: what ANU's page doesn't tell you

Putting all 19 residences' published content side by side surfaced gaps that
are easy to miss reading one page at a time. These are things a prospective
resident would reasonably want before choosing, that ANU's current listing
either buries, states inconsistently, or doesn't state at all:

1. **No way to compare residences at all.** This was the starting gap — 19
   independent pages, no shared table, filter, or map. (What deliverables 1
   and 2 of this prototype exist to fix.)
2. **Public transport and the shuttle aren't mentioned on the residence pages
   at all.** The Civic Loop shuttle route lives on a separate sustainability
   news post that nothing on the accommodation site links to. Distance to the
   nearest ACTION bus stop or shuttle stop is exactly the kind of thing that
   should live on every residence page, not require finding a news article.
3. **Pricing is inconsistent in both units and completeness.** Rates are
   quoted per week, but contract *lengths* differ (44-week vs. full-year) and
   aren't always stated next to the rate, so weekly figures aren't directly
   comparable across residences without reading the fine print on each. John
   XXIII College's page states costs as simply "tbc" — a prospective resident
   can't budget for it at all right now. A total-cost-of-year figure
   (rate × contract weeks + deposit + registration + committee fees) would let
   people compare like with like.
4. **Accessibility information is present for some residences and silent for
   most.** Burton & Garran Hall explicitly states "no lifts, stairs-only
   access"; the majority of the other 18 pages say nothing about lift access,
   step-free entry, or accessible bathrooms either way. Silence reads as
   "fine" when it may just mean "not documented" — worth stating explicitly
   either way for every residence, not just the ones with a known problem.
5. **No live vacancy or waitlist status.** Every "Apply now" link leads to
   the same StarRez portal regardless of whether that residence, or that room
   type, is actually still taking applications for the relevant intake. A
   simple "applications open/closed for [year]" per residence would save a
   click-through that currently only reveals that inside the (out-of-scope)
   StarRez system.
6. **No mention of internet, laundry, or utility costs/inclusions**, beyond
   "internet" or "laundry" appearing as a bare feature-list bullet on some
   pages. Whether laundry is coin-operated or included, and whether
   electricity/gas is capped or unlimited, materially affects the real weekly
   cost and isn't stated for any residence.
7. **No bike parking or bike-route information**, despite Canberra being very
   bike-friendly and ANU actively promoting cycling. Given a bus/shuttle map
   is missing entirely (point 2), a bike-facilities layer would be a natural
   companion for anyone not relying on the shuttle.
8. **Gallery photos aren't tied to the room type they illustrate.** Every
   residence page does have a multi-photo gallery (4–12 images), but the
   images are a flat, unlabelled set for the whole residence — a residence
   offering 6 room types at 6 different price points gives no way to tell
   which photo is the $322/wk "Standard" room versus the $480/wk "Studio". A
   photo (or floor plan) per room type, not just per residence, would do more
   for decision-making than the current one-gallery-fits-all approach.
9. **No information on couples/family rooms, pet policy, or LGBTQ+-inclusive
   or quiet/wellness floors** — all things students specifically ask about
   and none of the 19 pages mention either way.
10. **University House has no direct online application link** on its public
    page at all (every other residence links to a StarRez portal). Whether
    that's deliberate (a different, non-StarRez process) or an oversight
    isn't stated, and it's exactly the kind of gap this prototype can't fill
    without contacting ANU directly.

None of these are things this prototype invents data for — where ANU's page
is silent, this app stays silent too (see `capacityNote`/`accessibilityNote`
handling in `src/lib/db.ts` and `src/pages/residences/[slug].astro`, which
show "Not stated on the ANU residences page" rather than guessing). They're
recommendations for what ANU's *own* listing should add, not gaps this
prototype quietly papered over.
