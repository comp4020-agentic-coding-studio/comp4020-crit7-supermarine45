# Process overview

## What I built

I built an "improved" ANU Residence Explorer, which allows students to explore and manage their on-campus accommodation. In this prototype, I focused on several key areas for improvement:

1. Refined search and comparison: Students can search for accommodation more precisely and directly compare different accommodation types (e.g., rooms and studios) side by side.

2. Key information: The prototype surfaces practical information that can influence accommodation decisions, such as proximity to shuttle services and available in-room features.

3. Contract and maintenance management: Students can manage their accommodation contracts and submit maintenance requests directly through the portal.

I observed that, although these crucial features are not currently available in the original accommodation portal (e.g., contract was not available to view at all), which distract from the overall intuitiveness of the website.

## How I got here

The crit `spec` requires a rebuild of an existing ANU system, focused on identifying and addressing areas that could be improved. I therefore began the crit by recreating the core components of the ANU Accommodation Portal, including the accommodation listings and the corresponding details for each property.

[`59f4e17`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-supermarine45/commit/59f4e17af698a6526d3b5476596a8c6a77d5bf1b)

I firstly focused on the search and comparison functionality. The current portal has two main limitations: it provides limited fine-grained search capabilities, such as filtering and sorting, and does not support direct comparison between accommodation options. When using the original portal, I found that comparing accommodations required opening each listing individually and manually comparing their features. In the redesign, this process is streamlined through a side-by-side comparison feature and a Quick Search function that allows users to narrow down their options efficiently.

> The issue is the filter should be on a room to room bases. So the result should be: room X in accomodation Y to make it easier to compare between rooms. Could you also make an interface where we can compare each selected side by side in their features (price, location, etc) to make comparison easier?

> Make an 'quick start' interface to choose a hall

Built in [`78a7d91`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-supermarine45/commit/78a7d914cc13665156508f2bf5075e87118ca046)

The second area of improvement concerns the lack of key information. The original portal does not present certain details that may be relevant when comparing residences, such as their relative location and their amenities. These details have therefore been incorporated into the redesigned portal:

> Can you fix the following points? Search for these information from the internet (ANU website): no way to compare residences; public transport/shuttle distance missing from residence pages; pricing inconsistent and incomplete, no total-cost figure; accessibility info present for some, silent for most; no live vacancy/waitlist status; no internet/laundry/utility cost detail; no bike parking/route info; gallery photos not tied to room type; no couples/family/pet/LGBTQ+/quiet-floor info; University House has no direct application link.

Built in [`360fd82`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-supermarine45/commit/360fd8216e9d568367b90a8b003f0dda3b2ced9d)

Finally, I added functionality that allows users to view and manage their accommodation contract and submit maintenance requests directly through the portal. This consolidates tasks that would otherwise be performed manually (i.e., by emailing accommodation staff).

> if a user is logged in, I'd like to see a menu detailing the contracts (make a mock contract for an accommodation), remaining terms, cancelling contracts, maintenance request, and contact the residence assistant. Also, add a widget for the next direct debit date (dates are outlined here: [ANU's Direct debit dates 2026 PDF](https://d3gu8jtw4r0om.cloudfront.net/files/2026-07/Direct%20debit%20dates%202026_v5.pdf))

Built in [`66221cf`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-supermarine45/commit/66221cf12510b198908c88045dab417d76bb74fb)

Rather than focusing solely on browsing accommodation listings, the redesigned portal supports the broader functionality a user may need when selecting and managing their accommodation.
