import type { APIRoute } from "astro";
import { cancelMyContract } from "../../../lib/db";
import { safeRedirect } from "../../../lib/http";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const redirectTo = safeRedirect(form.get("redirect"), "/my-accommodation/");
  if (!locals.user) return redirect(`/login/?returnTo=${encodeURIComponent(redirectTo)}`, 303);

  // Requires a signature and an explicit acknowledgement, matching the
  // notice-of-cancellation form on /contract/[id]/cancel/ — cancelling isn't
  // a bare button press. Both inputs are also `required` client-side, so
  // this is only reached with either missing via a tampered request.
  const signature = String(form.get("signature") ?? "").trim();
  const agreed = form.get("agree") === "on";
  if (signature.length > 0 && agreed) {
    cancelMyContract(locals.user.id, signature);
  }
  return redirect(redirectTo, 303);
};
