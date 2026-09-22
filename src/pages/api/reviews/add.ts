import type { APIRoute } from "astro";
import { upsertReview } from "../../../lib/db";
import { safeRedirect } from "../../../lib/http";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const redirectTo = safeRedirect(form.get("redirect"), "/");
  if (!locals.user) return redirect(`/login/?returnTo=${encodeURIComponent(redirectTo)}`, 303);

  const residenceId = Number(form.get("residenceId"));
  const rating = Number(form.get("rating"));
  const body = String(form.get("body") ?? "").trim();
  if (Number.isInteger(residenceId) && Number.isInteger(rating) && rating >= 1 && rating <= 5 && body.length > 0) {
    upsertReview(locals.user.id, residenceId, rating, body);
  }
  return redirect(redirectTo, 303);
};
