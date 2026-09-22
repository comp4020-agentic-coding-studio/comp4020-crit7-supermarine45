// Shared across spec/*.test.ts: fetch() doesn't persist cookies between
// calls the way a browser does, so every test that needs to act as a logged
// in user extracts the Set-Cookie from signup/login itself and forwards it
// as a Cookie header on later requests.
//
// Astro's built-in CSRF check (astro.config.ts's `security`) rejects any
// unsafe-method request whose Origin header doesn't match the request's own
// origin — a real browser sends this automatically, but fetch() doesn't, so
// every POST helper here sets it explicitly.

export function sessionCookieFrom(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("expected a Set-Cookie header on this response");
  return setCookie.split(";")[0];
}

export async function postForm(baseUrl: string, path: string, body: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: baseUrl,
  };
  if (cookie) headers.Cookie = cookie;
  return fetch(new URL(path, baseUrl), { method: "POST", headers, body, redirect: "manual" });
}

export async function signUp(baseUrl: string, username: string, password: string): Promise<string> {
  const res = await postForm(
    baseUrl,
    "/api/auth/signup",
    `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&returnTo=/`,
  );
  if (res.status !== 303) throw new Error(`signup for ${username} failed with status ${res.status}`);
  return sessionCookieFrom(res);
}
