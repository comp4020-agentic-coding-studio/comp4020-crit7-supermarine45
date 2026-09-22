import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { postForm, signUp } from "./helpers";

// This week's own contracts, on top of the shipped invariants: the search
// filters actually narrow results, the quick-apply links are real, the
// interactive map carries real geodata, the shortlist survives a reload (now
// per logged-in user, not shared across everyone — see README.md), and
// unknown residences 404 instead of crashing. Assertions lean on seed/*.json
// facts (e.g. "exactly one flexi-catered residence") rather than
// implementation details, so they survive a rewrite of how filtering works.
const baseUrl = inject("baseUrl");

async function getDoc(path: string, cookie?: string): Promise<Document> {
  const res = await fetch(new URL(path, baseUrl), cookie ? { headers: { Cookie: cookie } } : undefined);
  const html = await res.text();
  return new JSDOM(html).window.document;
}

describe("quick start (home page)", () => {
  it("offers working preset links into pre-filtered search results, plus a link into hall matching", async () => {
    const home = await getDoc("/");
    const cards = [...home.querySelectorAll(".quick-start-card")];
    const hrefs = cards.map((c) => c.getAttribute("href") ?? "");
    expect(hrefs.length).toBe(5);
    expect(hrefs).toContain("/hall-match/");

    const searchHrefs = hrefs.filter((h) => h.startsWith("/search/"));
    expect(searchHrefs.length).toBe(4);

    for (const href of searchHrefs) {
      const doc = await getDoc(href);
      const resultsText = doc.getElementById("results-count")?.textContent?.trim() ?? "";
      expect(resultsText).not.toMatch(/^0 /);

      const url = new URL(href, "http://localhost");
      for (const [key, value] of url.searchParams) {
        const selected = doc.querySelector(`form.filters [name="${key}"]`);
        const selectedValue =
          selected?.tagName === "SELECT"
            ? selected.querySelector("option[selected]")?.getAttribute("value")
            : selected?.getAttribute("value");
        expect(selectedValue).toBe(value);
      }
    }
  });
});

describe("search filters", () => {
  it("with no filters, lists every room across every residence", async () => {
    const doc = await getDoc("/search/");
    expect(doc.querySelectorAll(".room-card").length).toBe(96);
  });

  it("type=both narrows to halls open to both undergrads and postgrads", async () => {
    const doc = await getDoc("/search/?type=both");
    expect(doc.querySelectorAll(".room-card").length).toBe(62);
    const halls = doc.querySelectorAll(".hall-card");
    expect(halls.length).toBeGreaterThan(0);
    for (const hall of halls) {
      expect(hall.textContent).toContain("Undergrad & postgrad");
    }
  });

  it("catering filter narrows to the rooms in the one flexi-catered residence", async () => {
    const doc = await getDoc("/search/?catering=flexi_catered");
    expect(doc.querySelectorAll(".room-card").length).toBe(3);
    const halls = doc.querySelectorAll(".hall-card");
    expect(halls.length).toBe(1);
    expect(halls[0].textContent).toContain("Wright Hall");
  });

  it("min price excludes cheaper rooms and rooms with no published rate", async () => {
    const doc = await getDoc("/search/?min=600");
    const cards = [...doc.querySelectorAll(".room-card")];
    expect(cards.length).toBe(17);
    for (const card of cards) {
      const priceText = card.querySelector(".room-card-price strong")?.textContent ?? "";
      expect(Number(priceText.replace("$", ""))).toBeGreaterThanOrEqual(600);
    }
  });

  it("keyword search matches rooms across residence names and blurbs", async () => {
    const doc = await getDoc("/search/?q=burgmann");
    expect(doc.querySelectorAll(".room-card").length).toBe(4);
    const halls = doc.querySelectorAll(".hall-card");
    expect(halls.length).toBeGreaterThan(0);
    for (const hall of halls) {
      expect(hall.textContent?.toLowerCase()).toContain("burgmann");
    }
  });

  it("shows a no-results message instead of an empty grid when nothing matches", async () => {
    const doc = await getDoc("/search/?q=zzzznonexistentresidence");
    expect(doc.querySelectorAll(".room-card").length).toBe(0);
    expect(doc.querySelector(".no-results")).toBeTruthy();
  });

  it("gives every hall with a published application link a working quick-apply button", async () => {
    const doc = await getDoc("/search/");
    // Scoped to .btn-primary — logged out, .card-actions also carries a
    // "Log in to save" link (see spec/auth.test.ts and the shortlist tests
    // below), which isn't a quick-apply link and shouldn't match here.
    const applyLinks = [...doc.querySelectorAll(".hall-card .card-actions a.btn-primary")];
    expect(applyLinks.length).toBeGreaterThan(0);
    for (const link of applyLinks) {
      expect(link.getAttribute("href")).toMatch(/^https?:\/\//);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  it("shows each hall's review status and distance to the nearest shuttle stop", async () => {
    const doc = await getDoc("/search/");
    const cardText = doc.querySelector(".hall-card")?.textContent ?? "";
    expect(cardText).toMatch(/No reviews yet|★/);
    expect(cardText).toMatch(/m to nearest shuttle stop/);
  });

  it("each hall's room options are collapsed by default but already present in the markup", async () => {
    const doc = await getDoc("/search/?catering=flexi_catered");
    const details = doc.querySelector(".hall-rooms");
    expect(details).toBeTruthy();
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.querySelectorAll(".room-card").length).toBe(3);
  });
});

describe("search sorting", () => {
  it("defaults to grouping rooms by residence, alphabetically", async () => {
    const doc = await getDoc("/search/");
    const names = [...doc.querySelectorAll(".hall-card h2 a")].map((a) => a.textContent?.trim() ?? "");
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("sort=price_desc puts the hall with the highest-priced room first, tie-broken by residence name", async () => {
    const doc = await getDoc("/search/?sort=price_desc");
    const cards = doc.querySelectorAll(".hall-card");
    // Five rooms tie at the seed data's global-maximum $641, spanning Kinloch
    // Lodge, Lena Karmel Lodge and Warrumbul Lodge — Kinloch sorts first.
    // The room's price still shows up in the hall card's textContent even
    // while its <details> is collapsed — jsdom includes collapsed <details>
    // content in textContent, since collapsing is a rendering behavior, not
    // a DOM-content removal.
    expect(cards[0].textContent).toContain("Kinloch Lodge");
    expect(cards[0].textContent).toContain("$641");
  });

  it("sort=price_asc puts the hall with the lowest-priced room first", async () => {
    const doc = await getDoc("/search/?sort=price_asc");
    const cards = doc.querySelectorAll(".hall-card");
    expect(cards[0].textContent).toContain("Burton & Garran Hall");
    expect(cards[0].textContent).toContain("$319");
  });
});

describe("search location filtering", () => {
  it("maxDistance narrows results to rooms near a shuttle stop, and a wide radius keeps them all", async () => {
    const allDoc = await getDoc("/search/");
    const allCount = allDoc.querySelectorAll(".room-card").length;

    const narrowDoc = await getDoc("/search/?maxDistance=1");
    expect(narrowDoc.querySelectorAll(".room-card").length).toBeLessThan(allCount);

    const wideDoc = await getDoc("/search/?maxDistance=100000");
    expect(wideDoc.querySelectorAll(".room-card").length).toBe(allCount);
  });
});

describe("search review filtering", () => {
  it("minRating only shows rooms in residences meeting the threshold", async () => {
    const cookie = await signUp(baseUrl, `search-rating-${Date.now()}`, "correct-horse-battery");
    const doc = await getDoc("/residences/university-house/", cookie);
    const residenceId = doc.querySelector("form.review-form input[name='residenceId']")?.getAttribute("value");
    expect(residenceId).toBeTruthy();

    await postForm(
      baseUrl,
      "/api/reviews/add",
      `residenceId=${residenceId}&rating=5&body=${encodeURIComponent("Great value near campus.")}&redirect=${encodeURIComponent("/residences/university-house/")}`,
      cookie,
    );

    const filtered = await getDoc("/search/?minRating=4");
    const cards = [...filtered.querySelectorAll(".hall-card")];
    expect(cards.some((c) => c.textContent?.includes("University House"))).toBe(true);
    // Every hall shown must itself carry a rating — minRating drops halls
    // that have never been reviewed (a null average can't clear a bar).
    for (const card of cards) {
      expect(card.textContent).toMatch(/★/);
    }
  });
});

describe("residence detail pages", () => {
  it("serves a known residence with its apply link and a link back to the official ANU page", async () => {
    const doc = await getDoc("/residences/burton-garran-hall/");
    expect(doc.querySelector("h1")?.textContent).toBe("Burton & Garran Hall");
    const applyLink = [...doc.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Apply now");
    expect(applyLink?.getAttribute("href")).toMatch(/^https:\/\/anucomb\.starrezhousing\.com/);
    const anuLink = [...doc.querySelectorAll("a")].find((a) => a.textContent?.includes("official ANU page"));
    expect(anuLink?.getAttribute("href")).toMatch(/^https:\/\/study\.anu\.edu\.au/);
  });

  it("omits the apply button for a residence with no published application link, showing its apply note instead", async () => {
    const doc = await getDoc("/residences/university-house/");
    const applyLink = [...doc.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Apply now");
    expect(applyLink).toBeUndefined();
    const note = doc.querySelector(".apply-note");
    expect(note?.textContent).toMatch(/doesn't use the StarRez portal/);
    const noteLink = note?.querySelector("a");
    expect(noteLink?.getAttribute("href")).toMatch(/^https:\/\/unihouse\.anu\.edu\.au/);
  });

  it("404s for a residence slug that doesn't exist", async () => {
    const res = await fetch(new URL("/residences/does-not-exist/", baseUrl));
    expect(res.status).toBe(404);
  });
});

describe("interactive map data", () => {
  it("plots every residence and the full Civic Loop shuttle route on the overview map", async () => {
    const doc = await getDoc("/");
    const map = doc.querySelector(".map-container");
    expect(map).toBeTruthy();
    const residencesData = JSON.parse(map?.getAttribute("data-residences") || "[]");
    const shuttleData = JSON.parse(map?.getAttribute("data-shuttle") || "[]");
    expect(residencesData.length).toBe(19);
    expect(shuttleData.length).toBe(12);
    for (const r of residencesData) {
      expect(typeof r.lat).toBe("number");
      expect(typeof r.lon).toBe("number");
    }
  });

  it("plots nearby OSM places on a residence's own map", async () => {
    const doc = await getDoc("/residences/burton-garran-hall/");
    const map = doc.querySelector(".map-container");
    const places = JSON.parse(map?.getAttribute("data-places") || "[]");
    expect(places.length).toBeGreaterThan(0);
  });

  it("names the nearest ANU Civic Loop shuttle stop", async () => {
    const doc = await getDoc("/residences/burton-garran-hall/");
    expect(doc.body.textContent).toMatch(/Nearest ANU Civic Loop stop:/);
  });

  it("also names the nearest real public bus stop, sourced from OSM rather than the ANU shuttle route", async () => {
    const doc = await getDoc("/residences/burton-garran-hall/");
    expect(doc.body.textContent).toMatch(/Nearest public bus stop:/);
  });
});

describe("good-to-know policy note", () => {
  it("appears on a residence detail page and on search, citing the no-pets and family-unsuitability facts", async () => {
    const detail = await getDoc("/residences/burton-garran-hall/");
    expect(detail.querySelector(".policy-note")?.textContent).toMatch(/No pets\./);

    const search = await getDoc("/search/");
    expect(search.querySelector(".policy-note")?.textContent).toMatch(/No pets\./);
  });
});

describe("shortlist persists across reload", () => {
  it("saving a residence keeps it shortlisted on a later, independent request, and removing it drops it again", async () => {
    const cookie = await signUp(baseUrl, `shortlist-owner-${Date.now()}`, "correct-horse-battery");

    const searchDoc = await getDoc("/search/", cookie);
    const card = [...searchDoc.querySelectorAll(".hall-card")].find((c) =>
      c.textContent?.includes("Burton & Garran Hall"),
    );
    const residenceId = card?.querySelector('input[name="residenceId"]')?.getAttribute("value");
    expect(residenceId).toBeTruthy();

    const addRes = await postForm(baseUrl, "/api/shortlist/add", `residenceId=${residenceId}&redirect=/shortlist/`, cookie);
    expect(addRes.status).toBe(303);

    // A fresh, independent request — standing in for a reload — must still see it.
    const shortlistDoc = await getDoc("/shortlist/", cookie);
    expect(shortlistDoc.body.textContent).toContain("Burton & Garran Hall");

    const removeRes = await postForm(
      baseUrl,
      "/api/shortlist/remove",
      `residenceId=${residenceId}&redirect=/shortlist/`,
      cookie,
    );
    expect(removeRes.status).toBe(303);

    const afterRemoveDoc = await getDoc("/shortlist/", cookie);
    expect(afterRemoveDoc.body.textContent).not.toContain("Burton & Garran Hall");
  });

  it("keeps one user's shortlist private from another logged-in user", async () => {
    const ownerCookie = await signUp(baseUrl, `shortlist-a-${Date.now()}`, "correct-horse-battery");
    const otherCookie = await signUp(baseUrl, `shortlist-b-${Date.now()}`, "correct-horse-battery");

    const searchDoc = await getDoc("/search/", ownerCookie);
    const card = [...searchDoc.querySelectorAll(".hall-card")].find((c) =>
      c.textContent?.includes("Wright Hall"),
    );
    const residenceId = card?.querySelector('input[name="residenceId"]')?.getAttribute("value");
    expect(residenceId).toBeTruthy();

    await postForm(baseUrl, "/api/shortlist/add", `residenceId=${residenceId}&redirect=/shortlist/`, ownerCookie);

    const ownerDoc = await getDoc("/shortlist/", ownerCookie);
    expect(ownerDoc.body.textContent).toContain("Wright Hall");

    const otherDoc = await getDoc("/shortlist/", otherCookie);
    expect(otherDoc.body.textContent).not.toContain("Wright Hall");
  });
});

describe("logged out", () => {
  it("shows a login prompt on the shortlist page instead of anyone's saved list", async () => {
    const doc = await getDoc("/shortlist/");
    expect(doc.querySelector("h1")?.textContent).toBe("Your shortlist");
    expect(doc.body.textContent).toMatch(/Log in|sign up/);
    expect(doc.querySelectorAll(".residence-card").length).toBe(0);
  });

  it("offers a login link instead of a shortlist button on a hall card", async () => {
    const doc = await getDoc("/search/");
    const card = doc.querySelector(".hall-card");
    const loginLink = card?.querySelector(".card-actions a.link-button");
    expect(loginLink?.getAttribute("href")).toMatch(/^\/login\/\?returnTo=/);
  });
});

describe("compare rooms", () => {
  it("shows two selected rooms side by side with their residence names and prices", async () => {
    const searchDoc = await getDoc("/search/");
    const ids = [...searchDoc.querySelectorAll<HTMLInputElement>(".room-card input.compare-checkbox")]
      .slice(0, 2)
      .map((el) => el.getAttribute("value"));
    expect(ids.length).toBe(2);

    const compareDoc = await getDoc(`/compare/?rooms=${ids[0]}&rooms=${ids[1]}`);
    const headerCells = [...compareDoc.querySelectorAll(".compare-table thead th")];
    expect(headerCells.length).toBe(3); // "Feature" + one column per room
    expect(compareDoc.querySelectorAll(".compare-table tbody tr").length).toBeGreaterThan(0);
    expect(compareDoc.body.textContent).toMatch(/\$\d+\/wk|Not yet published/);

    const costRow = [...compareDoc.querySelectorAll(".compare-table tbody tr")].find(
      (tr) => tr.querySelector("th")?.textContent === "Estimated cost for the year",
    );
    expect(costRow).toBeTruthy();
    for (const cell of costRow!.querySelectorAll("td")) {
      expect(cell.textContent).toMatch(/^\$[\d,]+ over [\d.]+ weeks$|^Can't be estimated \(tbc\)$/);
    }
  });

  it("shows an empty state with a link back to search when nothing is selected", async () => {
    const doc = await getDoc("/compare/");
    expect(doc.querySelector(".compare-empty")).toBeTruthy();
    const backLink = [...doc.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/search/");
    expect(backLink).toBeTruthy();
    expect(doc.querySelector(".compare-table")).toBeFalsy();
  });

  it("silently drops a room id that doesn't exist instead of erroring", async () => {
    const res = await fetch(new URL("/compare/?rooms=999999", baseUrl));
    expect(res.status).toBe(200);
    const doc = new JSDOM(await res.text()).window.document;
    expect(doc.querySelector(".compare-empty")).toBeTruthy();
  });

  it("each search room card carries a compare checkbox wired to the shared compare form", async () => {
    const doc = await getDoc("/search/");
    const compareForm = doc.getElementById("compare-form");
    expect(compareForm?.getAttribute("action")).toBe("/compare/");
    expect(compareForm?.getAttribute("method")).toBe("get");

    const checkbox = doc.querySelector(".room-card input.compare-checkbox");
    expect(checkbox?.getAttribute("name")).toBe("rooms");
    expect(checkbox?.getAttribute("form")).toBe("compare-form");
  });
});
