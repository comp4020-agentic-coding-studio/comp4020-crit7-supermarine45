import type { APIRoute } from "astro";
import { withdrawResidentRequest } from "../../../lib/db";
import { safeRedirect } from "../../../lib/http";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const redirectTo = safeRedirect(form.get("redirect"), "/my-accommodation/");
  if (!locals.user) return redirect(`/login/?returnTo=${encodeURIComponent(redirectTo)}`, 303);

  const requestId = Number(form.get("requestId"));
  if (Number.isInteger(requestId)) withdrawResidentRequest(locals.user.id, requestId);
  return redirect(redirectTo, 303);
};
