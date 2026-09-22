import type { APIRoute } from "astro";
import { removeFromShortlist } from "../../../lib/db";
import { safeRedirect } from "../../../lib/http";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const redirectTo = safeRedirect(form.get("redirect"), "/search/");
  if (!locals.user) return redirect(`/login/?returnTo=${encodeURIComponent(redirectTo)}`, 303);

  const residenceId = Number(form.get("residenceId"));
  if (Number.isInteger(residenceId)) removeFromShortlist(locals.user.id, residenceId);
  return redirect(redirectTo, 303);
};
