import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { postForm, signUp } from "./helpers";

// "My accommodation" is a mock contract, not a real booking (see
// src/lib/schema.ts) — these tests cover the account-scoped lifecycle: set →
// only one active contract at a time → cancel moves it to history, plus the
// maintenance-request / RA-message lists that hang off an active contract.
//
// Every seed room's contractTerm currently parses to a week count (see
// spec/cost.test.ts's own "tbc" case for the null path, unit-tested there
// since no seed room can exercise it end-to-end) — so there's no integration
// case here for the "contract length not published" remaining-term state.
const baseUrl = inject("baseUrl");
const PAGE_PATH = "/my-accommodation/";

async function getDoc(path: string, cookie?: string): Promise<Document> {
  const res = await fetch(new URL(path, baseUrl), cookie ? { headers: { Cookie: cookie } } : undefined);
  const html = await res.text();
  return new JSDOM(html).window.document;
}

async function setAccommodation(cookie: string, roomId: string): Promise<void> {
  const res = await postForm(baseUrl, "/api/contract/set", `roomId=${roomId}&redirect=${encodeURIComponent(PAGE_PATH)}`, cookie);
  expect(res.status).toBe(303);
}

describe("my accommodation", () => {
  it("redirects a logged-out visitor to login instead of showing the page", async () => {
    const res = await fetch(new URL(PAGE_PATH, baseUrl), { redirect: "manual" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login/");
  });

  it("shows a room picker until a contract is set, then a contract card instead", async () => {
    const cookie = await signUp(baseUrl, `contract-user-${Date.now()}`, "correct-horse-battery");
    const before = await getDoc(PAGE_PATH, cookie);
    const roomOption = before.querySelector("select[name='roomId'] option");
    const roomId = roomOption?.getAttribute("value");
    expect(roomId).toBeTruthy();
    expect(before.querySelector(".contract-card")).toBeNull();

    await setAccommodation(cookie, roomId!);

    const after = await getDoc(PAGE_PATH, cookie);
    expect(after.querySelector("select[name='roomId']")).toBeNull();
    const card = after.querySelector(".contract-card");
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain(roomOption!.textContent!.split(" — ")[0]);
  });

  it("replaces the active contract when a second room is set, leaving only one active", async () => {
    const cookie = await signUp(baseUrl, `contract-swap-user-${Date.now()}`, "correct-horse-battery");
    const doc = await getDoc(PAGE_PATH, cookie);
    const options = [...doc.querySelectorAll("select[name='roomId'] option")];
    expect(options.length).toBeGreaterThan(1);
    const [firstId, secondId] = options.map((o) => o.getAttribute("value")!);

    await setAccommodation(cookie, firstId);
    const firstName = (await getDoc(PAGE_PATH, cookie)).querySelector(".contract-card h2")?.textContent;

    await setAccommodation(cookie, secondId);
    const afterSecond = await getDoc(PAGE_PATH, cookie);
    expect(afterSecond.querySelectorAll(".contract-card").length).toBe(1);
    const secondName = afterSecond.querySelector(".contract-card h2")?.textContent;
    expect(secondName).not.toBe(firstName);

    const history = afterSecond.querySelector(".request-list");
    expect(history?.textContent).toContain(firstName?.split(" — ")[0].trim());
  });

  it("shows the direct-debit widget with a real upcoming date once a contract is set", async () => {
    const cookie = await signUp(baseUrl, `debit-user-${Date.now()}`, "correct-horse-battery");
    const doc = await getDoc(PAGE_PATH, cookie);
    const roomId = doc.querySelector("select[name='roomId'] option")?.getAttribute("value");
    await setAccommodation(cookie, roomId!);

    const after = await getDoc(PAGE_PATH, cookie);
    const widget = after.querySelector(".direct-debit-widget");
    expect(widget).toBeTruthy();
    expect(widget?.querySelector(".direct-debit-date")?.textContent).toMatch(/\d{4}/);
    expect(widget?.querySelector("a")?.getAttribute("href")).toContain(
      "d3gu8jtw4r0om.cloudfront.net/files/2026-07/Direct%20debit%20dates%202026_v5.pdf",
    );
  });

  it("cancelling a contract moves it to history and brings back the room picker", async () => {
    const cookie = await signUp(baseUrl, `cancel-user-${Date.now()}`, "correct-horse-battery");
    const doc = await getDoc(PAGE_PATH, cookie);
    const roomId = doc.querySelector("select[name='roomId'] option")?.getAttribute("value");
    await setAccommodation(cookie, roomId!);

    const withContract = await getDoc(PAGE_PATH, cookie);
    const roomName = withContract.querySelector(".contract-card h2")?.textContent;
    const contractHref = withContract.querySelector(".contract-card a[href^='/contract/']")?.getAttribute("href");
    const contractId = contractHref?.match(/\/contract\/(\d+)\//)?.[1];
    expect(contractId).toBeTruthy();

    // No signature/agree — the notice-of-cancellation form on
    // /contract/[id]/cancel/ requires both, so a bare POST is a silent no-op.
    const bareRes = await postForm(baseUrl, "/api/contract/cancel", `redirect=${encodeURIComponent(PAGE_PATH)}`, cookie);
    expect(bareRes.status).toBe(303);
    expect((await getDoc(PAGE_PATH, cookie)).querySelector(".contract-card")).toBeTruthy();

    const cancelRes = await postForm(
      baseUrl,
      "/api/contract/cancel",
      `redirect=${encodeURIComponent(PAGE_PATH)}&agree=on&signature=${encodeURIComponent("Jamie Resident")}`,
      cookie,
    );
    expect(cancelRes.status).toBe(303);

    const after = await getDoc(PAGE_PATH, cookie);
    expect(after.querySelector(".contract-card")).toBeNull();
    expect(after.querySelector("select[name='roomId']")).toBeTruthy();
    expect(after.querySelector("h2")?.textContent).toBe("Past accommodation");
    expect(after.body.textContent).toContain(roomName?.split(" — ")[0].trim());

    const receipt = await getDoc(`/contract/${contractId}/`, cookie);
    expect(receipt.querySelector(".contract-status")?.textContent).toContain("Cancelled");
    expect(receipt.querySelector(".cancellation-record")?.textContent).toContain("Jamie Resident");
  });

  it("shows a contract document that links to the sign-flow, then reflects cancellation once signed", async () => {
    const cookie = await signUp(baseUrl, `view-contract-user-${Date.now()}`, "correct-horse-battery");
    const doc = await getDoc(PAGE_PATH, cookie);
    const roomId = doc.querySelector("select[name='roomId'] option")?.getAttribute("value");
    await setAccommodation(cookie, roomId!);

    const withContract = await getDoc(PAGE_PATH, cookie);
    const contractHref = withContract.querySelector(".contract-card a[href^='/contract/']")?.getAttribute("href");
    expect(contractHref).toBeTruthy();

    const view = await getDoc(contractHref!, cookie);
    expect(view.querySelector(".contract-status")?.textContent).toContain("Active");
    expect(view.querySelector("a[href$='/cancel/']")).toBeTruthy();

    const cancelPage = await getDoc(`${contractHref}cancel/`, cookie);
    const form = cancelPage.querySelector("form[action='/api/contract/cancel']");
    expect(form?.querySelector("input[name='agree'][required]")).toBeTruthy();
    expect(form?.querySelector("input[name='signature'][required]")).toBeTruthy();

    await postForm(
      baseUrl,
      "/api/contract/cancel",
      `redirect=${encodeURIComponent(contractHref!)}&agree=on&signature=${encodeURIComponent("Alex Signer")}`,
      cookie,
    );

    const receipt = await getDoc(contractHref!, cookie);
    expect(receipt.querySelector(".contract-status")?.textContent).toContain("Cancelled");
    expect(receipt.querySelector(".cancellation-record")?.textContent).toContain("Alex Signer");
    expect(receipt.querySelector("a[href$='/cancel/']")).toBeNull();
  });

  it("404s when viewing another user's contract, or a contract id that doesn't exist", async () => {
    const ownerCookie = await signUp(baseUrl, `contract-owner-${Date.now()}`, "correct-horse-battery");
    const ownerDoc = await getDoc(PAGE_PATH, ownerCookie);
    const roomId = ownerDoc.querySelector("select[name='roomId'] option")?.getAttribute("value");
    await setAccommodation(ownerCookie, roomId!);
    const withContract = await getDoc(PAGE_PATH, ownerCookie);
    const contractHref = withContract.querySelector(".contract-card a[href^='/contract/']")?.getAttribute("href");

    const intruderCookie = await signUp(baseUrl, `contract-intruder-${Date.now()}`, "correct-horse-battery");
    const asIntruder = await fetch(new URL(contractHref!, baseUrl), { headers: { Cookie: intruderCookie } });
    expect(asIntruder.status).toBe(404);

    const missing = await fetch(new URL("/contract/999999/", baseUrl), { headers: { Cookie: ownerCookie } });
    expect(missing.status).toBe(404);
  });

  it("lets a resident submit a maintenance request and withdraw it", async () => {
    const cookie = await signUp(baseUrl, `maintenance-user-${Date.now()}`, "correct-horse-battery");
    const doc = await getDoc(PAGE_PATH, cookie);
    const roomId = doc.querySelector("select[name='roomId'] option")?.getAttribute("value");
    await setAccommodation(cookie, roomId!);

    await postForm(
      baseUrl,
      "/api/requests/add",
      `kind=maintenance&category=plumbing&message=${encodeURIComponent("Leaking tap in the kitchenette.")}&redirect=${encodeURIComponent(PAGE_PATH)}`,
      cookie,
    );

    const afterAdd = await getDoc(PAGE_PATH, cookie);
    const request = [...afterAdd.querySelectorAll(".request")].find((r) =>
      r.textContent?.includes("Leaking tap in the kitchenette."),
    );
    expect(request).toBeTruthy();
    expect(request?.textContent).toContain("plumbing");
    const requestId = request?.querySelector("input[name='requestId']")?.getAttribute("value");
    expect(requestId).toBeTruthy();

    await postForm(
      baseUrl,
      "/api/requests/withdraw",
      `requestId=${requestId}&redirect=${encodeURIComponent(PAGE_PATH)}`,
      cookie,
    );

    const afterWithdraw = await getDoc(PAGE_PATH, cookie);
    const withdrawn = [...afterWithdraw.querySelectorAll(".request")].find((r) =>
      r.textContent?.includes("Leaking tap in the kitchenette."),
    );
    expect(withdrawn?.textContent).toContain("Withdrawn");
    expect(withdrawn?.querySelector("form")).toBeNull();
  });

  it("lets a resident message the residence assistant, kept separate from maintenance requests", async () => {
    const cookie = await signUp(baseUrl, `ra-message-user-${Date.now()}`, "correct-horse-battery");
    const doc = await getDoc(PAGE_PATH, cookie);
    const roomId = doc.querySelector("select[name='roomId'] option")?.getAttribute("value");
    await setAccommodation(cookie, roomId!);

    await postForm(
      baseUrl,
      "/api/requests/add",
      `kind=ra_message&message=${encodeURIComponent("Can we arrange a time to discuss my roommate situation?")}&redirect=${encodeURIComponent(PAGE_PATH)}`,
      cookie,
    );

    const after = await getDoc(PAGE_PATH, cookie);
    const sections = [...after.querySelectorAll("section")];
    const maintenanceSection = sections.find((s) => s.querySelector("h2")?.textContent === "Maintenance requests");
    const raSection = sections.find((s) => s.querySelector("h2")?.textContent === "Contact the residence assistant");

    expect(raSection?.textContent).toContain("Can we arrange a time to discuss my roommate situation?");
    expect(maintenanceSection?.textContent).not.toContain("Can we arrange a time to discuss my roommate situation?");
  });

  it("doesn't let one user withdraw another user's request", async () => {
    const ownerCookie = await signUp(baseUrl, `request-owner-${Date.now()}`, "correct-horse-battery");
    const ownerDoc = await getDoc(PAGE_PATH, ownerCookie);
    const roomId = ownerDoc.querySelector("select[name='roomId'] option")?.getAttribute("value");
    await setAccommodation(ownerCookie, roomId!);

    await postForm(
      baseUrl,
      "/api/requests/add",
      `kind=ra_message&message=${encodeURIComponent("Private message, owner only.")}&redirect=${encodeURIComponent(PAGE_PATH)}`,
      ownerCookie,
    );
    const withRequest = await getDoc(PAGE_PATH, ownerCookie);
    const requestId = [...withRequest.querySelectorAll(".request")]
      .find((r) => r.textContent?.includes("Private message, owner only."))
      ?.querySelector("input[name='requestId']")
      ?.getAttribute("value");
    expect(requestId).toBeTruthy();

    const otherCookie = await signUp(baseUrl, `request-intruder-${Date.now()}`, "correct-horse-battery");
    await postForm(
      baseUrl,
      "/api/requests/withdraw",
      `requestId=${requestId}&redirect=${encodeURIComponent(PAGE_PATH)}`,
      otherCookie,
    );

    const stillThere = await getDoc(PAGE_PATH, ownerCookie);
    const request = [...stillThere.querySelectorAll(".request")].find((r) =>
      r.textContent?.includes("Private message, owner only."),
    );
    expect(request?.textContent).toContain("Sent");
    expect(request?.querySelector("form")).toBeTruthy();
  });
});
