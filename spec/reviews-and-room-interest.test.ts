import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { postForm, signUp } from "./helpers";

// Reviews and room interest both live on a residence's detail page and both
// require login the same way the shortlist does — this covers the
// authenticated/unauthenticated split for each, plus the one thing the
// per-user schema exists to guarantee: resubmitting a review edits it rather
// than creating a second row.
const baseUrl = inject("baseUrl");
const RESIDENCE_PATH = "/residences/burton-garran-hall/";

async function getDoc(path: string, cookie?: string): Promise<Document> {
  const res = await fetch(new URL(path, baseUrl), cookie ? { headers: { Cookie: cookie } } : undefined);
  const html = await res.text();
  return new JSDOM(html).window.document;
}

describe("reviews", () => {
  it("lets a logged-in user post a review, and resubmitting updates it instead of duplicating", async () => {
    const cookie = await signUp(baseUrl, `review-user-${Date.now()}`, "correct-horse-battery");
    const doc = await getDoc(RESIDENCE_PATH, cookie);
    const residenceIdValue = doc.querySelector("form.review-form input[name='residenceId']")?.getAttribute("value");
    expect(residenceIdValue).toBeTruthy();

    await postForm(
      baseUrl,
      "/api/reviews/add",
      `residenceId=${residenceIdValue}&rating=4&body=${encodeURIComponent("Good views, noisy corridor.")}&redirect=${encodeURIComponent(RESIDENCE_PATH)}`,
      cookie,
    );

    const afterFirst = await getDoc(RESIDENCE_PATH, cookie);
    expect(afterFirst.body.textContent).toContain("Good views, noisy corridor.");
    expect(afterFirst.querySelectorAll(".review").length).toBe(1);

    await postForm(
      baseUrl,
      "/api/reviews/add",
      `residenceId=${residenceIdValue}&rating=5&body=${encodeURIComponent("Updated: actually great once I got ear plugs.")}&redirect=${encodeURIComponent(RESIDENCE_PATH)}`,
      cookie,
    );

    const afterSecond = await getDoc(RESIDENCE_PATH, cookie);
    expect(afterSecond.querySelectorAll(".review").length).toBe(1);
    expect(afterSecond.body.textContent).toContain("Updated: actually great once I got ear plugs.");
    expect(afterSecond.body.textContent).not.toContain("Good views, noisy corridor.");
  });

  it("redirects an unauthenticated review post to login instead of creating a row", async () => {
    const before = await getDoc(RESIDENCE_PATH);
    const countBefore = before.querySelectorAll(".review").length;

    const res = await postForm(
      baseUrl,
      "/api/reviews/add",
      `residenceId=1&rating=5&body=${encodeURIComponent("Should not be saved.")}&redirect=${encodeURIComponent(RESIDENCE_PATH)}`,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login/");

    const after = await getDoc(RESIDENCE_PATH);
    expect(after.querySelectorAll(".review").length).toBe(countBefore);
    expect(after.body.textContent).not.toContain("Should not be saved.");
  });
});

describe("room interest", () => {
  it("lets a logged-in user flag and unflag interest in a room type, moving the count", async () => {
    const cookie = await signUp(baseUrl, `interest-user-${Date.now()}`, "correct-horse-battery");
    const doc = await getDoc(RESIDENCE_PATH, cookie);
    const form = doc.querySelector(".room-interest form");
    const roomId = form?.querySelector("input[name='roomId']")?.getAttribute("value");
    expect(roomId).toBeTruthy();
    const countBefore = Number(doc.querySelector(".room-interest-count")?.textContent?.match(/^\d+/)?.[0]);

    await postForm(baseUrl, "/api/room-interest/add", `roomId=${roomId}&redirect=${encodeURIComponent(RESIDENCE_PATH)}`, cookie);

    const afterAdd = await getDoc(RESIDENCE_PATH, cookie);
    const countAfterAdd = Number(afterAdd.querySelector(".room-interest-count")?.textContent?.match(/^\d+/)?.[0]);
    expect(countAfterAdd).toBe(countBefore + 1);
    expect(afterAdd.querySelector(".room-interest form button")?.textContent?.trim()).toBe("Remove interest");

    await postForm(
      baseUrl,
      "/api/room-interest/remove",
      `roomId=${roomId}&redirect=${encodeURIComponent(RESIDENCE_PATH)}`,
      cookie,
    );

    const afterRemove = await getDoc(RESIDENCE_PATH, cookie);
    const countAfterRemove = Number(afterRemove.querySelector(".room-interest-count")?.textContent?.match(/^\d+/)?.[0]);
    expect(countAfterRemove).toBe(countBefore);
  });

  it("offers a login link instead of an interest button when logged out", async () => {
    const doc = await getDoc(RESIDENCE_PATH);
    const link = doc.querySelector(".room-interest a.link-button");
    expect(link?.getAttribute("href")).toMatch(/^\/login\/\?returnTo=/);
  });
});
