import { describe, expect, it } from "vitest";
import { estimateAnnualCost, parseContractWeeks, parseFeeAmount } from "../src/lib/cost";

// Pure-function tests, no server/build needed — see src/lib/cost.ts for why
// these parsers are deliberately narrow rather than a general money parser.

describe("parseContractWeeks", () => {
  it("reads the leading week count off a contract term string", () => {
    expect(parseContractWeeks("44 weeks")).toBe(44);
    expect(parseContractWeeks("43.57 weeks (new)")).toBe(43.57);
    expect(parseContractWeeks("1 week")).toBe(1);
  });

  it("returns null when there's nothing to parse", () => {
    expect(parseContractWeeks(null)).toBeNull();
    expect(parseContractWeeks("tbc")).toBeNull();
  });
});

describe("parseFeeAmount", () => {
  it("reads a dollar amount out of a free-text fee line", () => {
    expect(parseFeeAmount("Registration Fee: $400")).toBe(400);
    expect(parseFeeAmount("Refundable Deposit: $1,300")).toBe(1300);
  });

  it("returns null for a fee line with no dollar amount (e.g. tbc)", () => {
    expect(parseFeeAmount("2 weeks rent: tbc")).toBeNull();
  });
});

describe("estimateAnnualCost", () => {
  it("computes a real seed-data room's total, separating one-off fees from refundable/prepaid amounts", () => {
    // Burton & Garran Hall's Standard room (seed/residences.json).
    const estimate = estimateAnnualCost({
      weeklyTariff: 322,
      contractTerm: "44 weeks",
      otherFees: ["2 weeks rent: $644", "Refundable Deposit: $1,300", "Registration Fee: $400", "Residents Committee fee: $240"],
    });
    expect(estimate).toEqual({
      weeks: 44,
      rent: 14168,
      oneOffFees: 640,
      total: 14808,
      excludedRefundable: 1944,
    });
  });

  it("returns null when the weekly tariff is unpublished (tbc), rather than inventing a number", () => {
    // John XXIII College's only room type — its real ANU page states this rate as tbc.
    const estimate = estimateAnnualCost({
      weeklyTariff: null,
      contractTerm: "44 weeks",
      otherFees: ["2 weeks rent: tbc", "Room deposit: $1,000", "Registration Fee (New students only): $350", "Residents' Association: $350"],
    });
    expect(estimate).toBeNull();
  });

  it("returns null when the contract length can't be parsed", () => {
    expect(estimateAnnualCost({ weeklyTariff: 300, contractTerm: null, otherFees: [] })).toBeNull();
  });
});
