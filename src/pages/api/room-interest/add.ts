import type { APIRoute } from "astro";
import { addRoomInterest } from "../../../lib/db";
import { safeRedirect } from "../../../lib/http";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const redirectTo = safeRedirect(form.get("redirect"), "/");
  if (!locals.user) return redirect(`/login/?returnTo=${encodeURIComponent(redirectTo)}`, 303);

  const roomId = Number(form.get("roomId"));
  if (Number.isInteger(roomId)) addRoomInterest(locals.user.id, roomId);
  return redirect(redirectTo, 303);
};
