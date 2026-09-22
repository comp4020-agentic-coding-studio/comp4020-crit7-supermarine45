// Every room's ANU tariff table already states a weekly rate, a contract
// length and a handful of free-text fee lines — but never a single
// "what will this actually cost me" figure, which is exactly what makes
// halls on different contract lengths (44 weeks vs. full-year) hard to
// compare like with like. These are pure, narrow parsers over that existing
// text rather than a general-purpose money parser: they only need to handle
// the fee label variants that actually appear in seed/residences.json.

export function parseContractWeeks(contractTerm: string | null): number | null {
  if (!contractTerm) return null;
  const match = contractTerm.match(/^([\d.]+)\s*weeks?/i);
  if (!match) return null;
  const weeks = Number(match[1]);
  return Number.isFinite(weeks) ? weeks : null;
}

export function parseFeeAmount(fee: string): number | null {
  const match = fee.match(/\$([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

// A fee line is "refundable" (a deposit) or an advance-rent prepayment
// ("2 weeks rent: $926") — both already counted in, or returned outside of,
// the base rent figure, so they're tracked separately rather than added on
// top of it.
function isExcludedFromTotal(fee: string): boolean {
  return /deposit/i.test(fee) || /^\d.*weeks?\s+rent/i.test(fee);
}

export interface AnnualCostEstimate {
  weeks: number;
  rent: number;
  oneOffFees: number;
  total: number;
  excludedRefundable: number;
}

export function estimateAnnualCost(room: {
  weeklyTariff: number | null;
  contractTerm: string | null;
  otherFees: string[];
}): AnnualCostEstimate | null {
  const weeks = parseContractWeeks(room.contractTerm);
  if (room.weeklyTariff == null || weeks == null) return null;

  const rent = room.weeklyTariff * weeks;
  let oneOffFees = 0;
  let excludedRefundable = 0;
  for (const fee of room.otherFees) {
    const amount = parseFeeAmount(fee);
    if (amount == null) continue;
    if (isExcludedFromTotal(fee)) {
      excludedRefundable += amount;
    } else {
      oneOffFees += amount;
    }
  }

  return { weeks, rent, oneOffFees, total: rent + oneOffFees, excludedRefundable };
}
