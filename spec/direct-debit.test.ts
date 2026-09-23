import { describe, expect, it } from "vitest";
import { isLodge, nextDirectDebitDate } from "../src/lib/directDebit";

// Pure-function tests, no server/build needed — see src/lib/directDebit.ts
// for why only the debit date itself (not the billing-period span) is
// reproduced from ANU's published PDF.

describe("isLodge", () => {
  it("matches the four residences ANU itself names as a Lodge", () => {
    expect(isLodge("Davey Lodge")).toBe(true);
    expect(isLodge("Kinloch Lodge")).toBe(true);
    expect(isLodge("Warrumbul Lodge")).toBe(true);
    expect(isLodge("Lena Karmel Lodge")).toBe(true);
  });

  it("doesn't match an ordinary hall or college name", () => {
    expect(isLodge("Burton & Garran Hall")).toBe(false);
    expect(isLodge("Burgmann College")).toBe(false);
  });
});

describe("nextDirectDebitDate", () => {
  it("finds the next date on or after the given day", () => {
    expect(nextDirectDebitDate("Burton & Garran Hall", new Date("2026-09-23T00:00:00Z"))).toBe("2026-09-24");
    expect(nextDirectDebitDate("Davey Lodge", new Date("2026-09-23T00:00:00Z"))).toBe("2026-09-24");
  });

  it("uses a genuinely different schedule for Lodges than for Residences", () => {
    // Early-to-mid 2026, the two schedules don't coincide: Lodges bill on
    // Wednesdays, Residences the following day.
    expect(nextDirectDebitDate("Davey Lodge", new Date("2026-05-01T00:00:00Z"))).toBe("2026-05-06");
    expect(nextDirectDebitDate("Burton & Garran Hall", new Date("2026-05-01T00:00:00Z"))).toBe("2026-05-07");
  });

  it("returns null once the published schedule is exhausted", () => {
    expect(nextDirectDebitDate("Burton & Garran Hall", new Date("2027-02-01T00:00:00Z"))).toBeNull();
  });
});
