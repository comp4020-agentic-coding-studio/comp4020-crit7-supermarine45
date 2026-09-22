import type { PreferencesInput, Residence, SocialPreference } from "./db";

export interface MatchResult {
  residence: Residence;
  score: number;
  reasons: string[];
}

// ANU's published residence pages state catering style but nothing like a
// "social" or "culture" attribute — there's no field to compare a "social
// expectations" answer against. This maps catering style to a rough
// independence/social proxy instead (shared catered dining runs scheduled,
// social meal times; self-catered is the most independent; flexi-catered
// sits between the two). It's a judgement call, documented in README.md, not
// something ANU's pages state — every match reason below says so via the
// wording rather than presenting it as fact.
const CATERING_SOCIAL: Record<Residence["cateringType"], SocialPreference> = {
  self_catered: "quiet",
  flexi_catered: "balanced",
  catered: "social",
};

const SOCIAL_ORDER: Record<SocialPreference, number> = { quiet: 0, balanced: 1, social: 2 };

const CATERING_LABEL: Record<Residence["cateringType"], string> = {
  self_catered: "Self-catered",
  catered: "Catered",
  flexi_catered: "Flexi-catered",
};

export function matchResidences(prefs: PreferencesInput, candidates: Residence[]): MatchResult[] {
  const results = candidates.map((residence) => {
    let score = 0;
    const maxScore = 30 + 30 + 20 + 20;
    const reasons: string[] = [];

    if (prefs.residentType === "no_preference") {
      score += 30;
    } else if (prefs.residentType === "both") {
      if (residence.residentUndergrad && residence.residentPostgrad) {
        score += 30;
        reasons.push("Open to both undergraduate and postgraduate residents, as you wanted");
      }
    } else if (prefs.residentType === "undergrad" && residence.residentUndergrad) {
      score += 30;
      reasons.push("Takes undergraduate residents");
    } else if (prefs.residentType === "postgrad" && residence.residentPostgrad) {
      score += 30;
      reasons.push("Takes postgraduate residents");
    }

    if (residence.weeklyRateFrom == null) {
      score += 10;
    } else if (prefs.budgetMax != null && residence.weeklyRateFrom <= prefs.budgetMax) {
      score += 30;
      reasons.push(`From $${residence.weeklyRateFrom}/wk — within your budget`);
    } else if (prefs.budgetMax != null) {
      const over = residence.weeklyRateFrom - prefs.budgetMax;
      score += Math.max(0, 30 - over / 5);
    } else {
      score += 20;
    }

    if (prefs.catering === "no_preference") {
      score += 20;
    } else if (residence.cateringType === prefs.catering) {
      score += 20;
      reasons.push(`${CATERING_LABEL[residence.cateringType]}, matching your catering preference`);
    } else if (residence.cateringType === "flexi_catered") {
      score += 10;
      reasons.push("Flexi-catered — a middle ground on catering");
    }

    const socialGuess = CATERING_SOCIAL[residence.cateringType];
    if (socialGuess === prefs.social) {
      score += 20;
      reasons.push(`${CATERING_LABEL[residence.cateringType]} halls tend to suit a ${prefs.social} preference (our estimate, not an ANU-published fact)`);
    } else if (Math.abs(SOCIAL_ORDER[socialGuess] - SOCIAL_ORDER[prefs.social]) === 1) {
      score += 10;
    }

    return { residence, score: Math.round((score / maxScore) * 100), reasons };
  });

  return results.sort((a, b) => b.score - a.score);
}
