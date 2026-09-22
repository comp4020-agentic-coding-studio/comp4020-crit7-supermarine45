import type { APIRoute } from "astro";
import { createSession, SESSION_COOKIE, verifyCredentials } from "../../../lib/auth";
import { safeRedirect } from "../../../lib/http";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const returnTo = safeRedirect(form.get("returnTo"), "/");

  const user = await verifyCredentials(username, password);
  if (!user) {
    return redirect(
      `/login/?error=${encodeURIComponent("Incorrect username or password.")}&returnTo=${encodeURIComponent(returnTo)}`,
      303,
    );
  }

  const token = createSession(user.id);
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 24 * 30,
  });
  return redirect(returnTo, 303);
};
