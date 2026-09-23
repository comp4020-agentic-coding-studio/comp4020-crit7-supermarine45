// ANU publishes two separate fortnightly direct-debit schedules for 2026 —
// one for "ANU Residences" (halls/colleges) and one for "ANU Lodges" (the
// self-catered, apartment-style residences it markets as "Lodge") — see:
// https://d3gu8jtw4r0om.cloudfront.net/files/2026-07/Direct%20debit%20dates%202026_v5.pdf
//
// Only the direct-debit date itself is reproduced here. The PDF's "billing
// period From/To" columns extracted inconsistently (the first two rows of
// each table read backwards in time), which looks like a table-extraction
// artefact rather than genuine source data — so, in keeping with this app's
// existing "don't ship data you can't verify" rule (see parseContractWeeks
// and estimateAnnualCost in src/lib/cost.ts), that span is deliberately
// omitted rather than guessed at. Every date below was cross-checked against
// the PDF's own year-at-a-glance calendar graphic.
export const ANU_RESIDENCES_DIRECT_DEBIT_DATES: string[] = [
  "2026-01-15",
  "2026-01-29",
  "2026-02-12",
  "2026-02-26",
  "2026-03-12",
  "2026-03-26",
  "2026-04-09",
  "2026-04-23",
  "2026-05-07",
  "2026-05-21",
  "2026-06-04",
  "2026-06-18",
  "2026-07-03",
  "2026-07-16",
  "2026-07-30",
  "2026-08-13",
  "2026-08-27",
  "2026-09-10",
  "2026-09-24",
  "2026-10-08",
  "2026-10-22",
  "2026-11-05",
  "2026-11-19",
  "2026-12-03",
  "2026-12-17",
  "2027-01-06",
  "2027-01-14",
];

export const ANU_LODGES_DIRECT_DEBIT_DATES: string[] = [
  "2026-01-14",
  "2026-01-28",
  "2026-02-11",
  "2026-02-25",
  "2026-03-11",
  "2026-03-25",
  "2026-04-08",
  "2026-04-22",
  "2026-05-06",
  "2026-05-20",
  "2026-06-03",
  "2026-06-17",
  "2026-07-01",
  "2026-07-13",
  "2026-07-30",
  "2026-08-13",
  "2026-08-27",
  "2026-09-10",
  "2026-09-24",
  "2026-10-08",
  "2026-10-22",
  "2026-11-05",
  "2026-11-19",
  "2026-12-03",
  "2026-12-17",
  "2027-01-06",
  "2027-01-14",
];

// ANU's own naming convention: exactly four of this app's seeded residences
// carry "Lodge" in their real name (Davey Lodge, Kinloch Lodge, Warrumbul
// Lodge, Lena Karmel Lodge), and no residence name matches ambiguously.
export function isLodge(residenceName: string): boolean {
  return /\blodge\b/i.test(residenceName);
}

// `from` defaults to the current time but is a parameter (not read from
// inside the function) so tests can assert deterministically without
// mocking the system clock.
export function nextDirectDebitDate(residenceName: string, from: Date = new Date()): string | null {
  const table = isLodge(residenceName) ? ANU_LODGES_DIRECT_DEBIT_DATES : ANU_RESIDENCES_DIRECT_DEBIT_DATES;
  const fromIso = from.toISOString().slice(0, 10);
  return table.find((date) => date >= fromIso) ?? null;
}
