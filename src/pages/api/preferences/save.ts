import type { APIRoute } from "astro";
import type { CateringPreference, ResidentPreference, SocialPreference } from "../../../lib/db";
import { savePreferences } from "../../../lib/db";
import { safeRedirect } from "../../../lib/http";

const CATERING: CateringPreference[] = ["self_catered", "catered", "flexi_catered", "no_preference"];
const RESIDENT_TYPE: ResidentPreference[] = ["undergrad", "postgrad", "both", "no_preference"];
const SOCIAL: SocialPreference[] = ["quiet", "balanced", "social"];

function parseBudget(value: FormDataEntryValue | null): number | null {
  const num = Number(value);
  return value && Number.isFinite(num) && num > 0 ? num : null;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const redirectTo = safeRedirect(form.get("redirect"), "/hall-match/");
  if (!locals.user) return redirect(`/login/?returnTo=${encodeURIComponent(redirectTo)}`, 303);

  const catering = CATERING.includes(form.get("catering") as CateringPreference)
    ? (form.get("catering") as CateringPreference)
    : "no_preference";
  const residentType = RESIDENT_TYPE.includes(form.get("residentType") as ResidentPreference)
    ? (form.get("residentType") as ResidentPreference)
    : "no_preference";
  const social = SOCIAL.includes(form.get("social") as SocialPreference) ? (form.get("social") as SocialPreference) : "balanced";

  savePreferences(locals.user.id, {
    budgetMin: parseBudget(form.get("budgetMin")),
    budgetMax: parseBudget(form.get("budgetMax")),
    catering,
    residentType,
    social,
  });
  return redirect(redirectTo, 303);
};
