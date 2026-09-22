import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { postForm, signUp } from "./helpers";

// The hall-matching score is a heuristic (see src/lib/match.ts), so this
// doesn't assert exact numbers — it asserts the one thing the seed data lets
// us know for certain: a flexi-catered preference should put Wright Hall,
// the only flexi-catered residence (see spec/residence-explorer.test.ts),
// clearly ahead of every self- or fully-catered hall.
const baseUrl = inject("baseUrl");

async function getDoc(path: string, cookie: string): Promise<Document> {
  const res = await fetch(new URL(path, baseUrl), { headers: { Cookie: cookie } });
  const html = await res.text();
  return new JSDOM(html).window.document;
}

describe("hall matching", () => {
  it("ranks the only flexi-catered residence first for a flexi-catering preference", async () => {
    const cookie = await signUp(baseUrl, `match-user-${Date.now()}`, "correct-horse-battery");

    await postForm(
      baseUrl,
      "/api/preferences/save",
      "residentType=no_preference&catering=flexi_catered&social=balanced&budgetMin=&budgetMax=",
      cookie,
    );

    const doc = await getDoc("/hall-match/", cookie);
    const cards = [...doc.querySelectorAll(".match-card")];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].querySelector("h3 a")?.textContent).toBe("Wright Hall");
  });

  it("redirects a logged-out visitor to login instead of showing the questionnaire", async () => {
    const res = await fetch(new URL("/hall-match/", baseUrl), { redirect: "manual" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login/");
  });

  it("prefers a real reviewer answer over the catering-based estimate for the social axis", async () => {
    // John XXIII College is catered (the catering-based proxy would guess
    // "social"), and no other spec file touches its reviews — a clean
    // residence to prove a real reviewer answer overrides that guess.
    const reviewerCookie = await signUp(baseUrl, `vibe-reviewer-${Date.now()}`, "correct-horse-battery");
    const residencePage = await getDoc("/residences/john-xxiii-college/", reviewerCookie);
    const residenceId = residencePage
      .querySelector("form.review-form input[name='residenceId']")
      ?.getAttribute("value");
    expect(residenceId).toBeTruthy();

    await postForm(
      baseUrl,
      "/api/reviews/add",
      `residenceId=${residenceId}&rating=5&body=${encodeURIComponent("Very quiet, everyone keeps to themselves.")}&socialVibe=quiet&redirect=${encodeURIComponent("/residences/john-xxiii-college/")}`,
      reviewerCookie,
    );

    const matcherCookie = await signUp(baseUrl, `vibe-matcher-${Date.now()}`, "correct-horse-battery");
    await postForm(
      baseUrl,
      "/api/preferences/save",
      "residentType=no_preference&catering=no_preference&social=quiet&budgetMin=&budgetMax=",
      matcherCookie,
    );

    const doc = await getDoc("/hall-match/", matcherCookie);
    const card = [...doc.querySelectorAll(".match-card")].find(
      (c) => c.querySelector("h3 a")?.textContent === "John XXIII College",
    );
    const reasons = card?.querySelector(".match-reasons")?.textContent ?? "";
    expect(reasons).toMatch(/1 reviewer described this hall's social atmosphere as "quiet"/);
  });
});
