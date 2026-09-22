import type { APIRoute } from "astro";
import { createSession, createUser, SESSION_COOKIE } from "../../../lib/auth";
import { safeRedirect } from "../../../lib/http";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const returnTo = safeRedirect(form.get("returnTo"), "/");

  const fail = (error: string) =>
    redirect(`/signup/?error=${encodeURIComponent(error)}&returnTo=${encodeURIComponent(returnTo)}`, 303);

  if (username.length < 3) return fail("Username must be at least 3 characters.");
  if (password.length < 8) return fail("Password must be at least 8 characters.");

  const user = await createUser(username, password);
  if (!user) return fail("That username is already taken.");

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
