import type { APIRoute } from "astro";
import type { SocialPreference } from "../../../lib/db";
import { upsertReview } from "../../../lib/db";
import { safeRedirect } from "../../../lib/http";

const SOCIAL_VIBES = new Set<string>(["quiet", "balanced", "social"]);

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const redirectTo = safeRedirect(form.get("redirect"), "/");
  if (!locals.user) return redirect(`/login/?returnTo=${encodeURIComponent(redirectTo)}`, 303);

  const residenceId = Number(form.get("residenceId"));
  const rating = Number(form.get("rating"));
  const body = String(form.get("body") ?? "").trim();
  const socialVibeRaw = String(form.get("socialVibe") ?? "");
  const socialVibe = SOCIAL_VIBES.has(socialVibeRaw) ? (socialVibeRaw as SocialPreference) : null;
  if (Number.isInteger(residenceId) && Number.isInteger(rating) && rating >= 1 && rating <= 5 && body.length > 0) {
    upsertReview(locals.user.id, residenceId, rating, body, socialVibe);
  }
  return redirect(redirectTo, 303);
};
