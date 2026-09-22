# Crit 7 reflection

**What was the breakthrough that moved the work forward?**

The breakthrough was refusing to trust my own diagnosis of a bug report before
checking it. When a "the sorting does not work" report came in, the obvious
move was to assume the sort logic was broken and start rewriting it. Instead I
reproduced it first — rebuilt locally, curled the search page under every sort
order, and checked the results against facts I already knew about the seed
data (which residence is cheapest, which is priciest, which has no published
rate at all). The backend was correct in every case. That result was more
useful than a fix would have been, because it pointed at the real cause: the
deployed app was still serving the build from before this round's work, since
none of it had been pushed or deployed yet. Curling the live `.fly.dev` URL
directly confirmed it. The actual fix wasn't touching the sort comparator at
all — it was recognising that "the feature doesn't work" and "the feature
isn't live" produce identical bug reports from the outside, and that only one
of them gets fixed by editing code.

**What did this work change about who I want to be as a software developer?**

It sharpened a habit I want to keep: when a user's report and my own testing
disagree, the disagreement itself is the lead, not something to explain away.
The map "scaling" report turned out to be a second, genuinely real bug hiding
behind the same message — a missing `ResizeObserver` on the Leaflet container
— and I'd have missed it if I'd stopped at "the sort logic checks out."
