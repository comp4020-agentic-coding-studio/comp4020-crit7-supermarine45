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

describe("search filters", () => {
  it("with no filters, lists every residence", async () => {
    const doc = await getDoc("/search/");
    expect(doc.querySelectorAll(".residence-card").length).toBe(19);
  });

  it("type=both narrows to residences open to both undergrads and postgrads", async () => {
    const doc = await getDoc("/search/?type=both");
    const cards = doc.querySelectorAll(".residence-card");
    expect(cards.length).toBe(9);
    for (const card of cards) {
      expect(card.textContent).toContain("Undergrad & postgrad");
    }
  });

  it("catering filter narrows to the one flexi-catered residence", async () => {
    const doc = await getDoc("/search/?catering=flexi_catered");
    const cards = doc.querySelectorAll(".residence-card");
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain("Wright Hall");
  });

  it("min price excludes cheaper residences and residences with no published rate", async () => {
    const doc = await getDoc("/search/?min=600");
    const cards = doc.querySelectorAll(".residence-card");
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain("Burgmann College");
  });

  it("keyword search matches across residence names", async () => {
    const doc = await getDoc("/search/?q=burgmann");
    const cards = doc.querySelectorAll(".residence-card");
    expect(cards.length).toBe(2);
    for (const card of cards) {
      expect(card.textContent?.toLowerCase()).toContain("burgmann");
    }
  });

  it("shows a no-results message instead of an empty grid when nothing matches", async () => {
    const doc = await getDoc("/search/?q=zzzznonexistentresidence");
    expect(doc.querySelectorAll(".residence-card").length).toBe(0);
    expect(doc.querySelector(".no-results")).toBeTruthy();
  });

  it("gives every result with a published application link a working quick-apply button", async () => {
    const doc = await getDoc("/search/");
    // Scoped to .btn-primary — logged out, .card-actions also carries a
    // "Log in to save" link (see spec/auth.test.ts and the shortlist tests
    // below), which isn't a quick-apply link and shouldn't match here.
    const applyLinks = [...doc.querySelectorAll(".residence-card .card-actions a.btn-primary")];
    expect(applyLinks.length).toBeGreaterThan(0);
    for (const link of applyLinks) {
      expect(link.getAttribute("href")).toMatch(/^https?:\/\//);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
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

  it("omits the apply button for a residence with no published application link", async () => {
    const doc = await getDoc("/residences/university-house/");
    const applyLink = [...doc.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Apply now");
    expect(applyLink).toBeUndefined();
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
});

describe("shortlist persists across reload", () => {
  it("saving a residence keeps it shortlisted on a later, independent request, and removing it drops it again", async () => {
    const cookie = await signUp(baseUrl, `shortlist-owner-${Date.now()}`, "correct-horse-battery");

    const searchDoc = await getDoc("/search/", cookie);
    const card = [...searchDoc.querySelectorAll(".residence-card")].find((c) =>
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
    const card = [...searchDoc.querySelectorAll(".residence-card")].find((c) =>
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

  it("offers a login link instead of a shortlist button on a residence card", async () => {
    const doc = await getDoc("/search/");
    const card = doc.querySelector(".residence-card");
    const loginLink = card?.querySelector(".card-actions a.link-button");
    expect(loginLink?.getAttribute("href")).toMatch(/^\/login\/\?returnTo=/);
  });
});
