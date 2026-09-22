import type { APIRoute } from "astro";
import { deleteSession, SESSION_COOKIE } from "../../../lib/auth";
import { safeRedirect } from "../../../lib/http";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  cookies.delete(SESSION_COOKIE, { path: "/" });
  return redirect(safeRedirect(form.get("redirect"), "/"), 303);
};
