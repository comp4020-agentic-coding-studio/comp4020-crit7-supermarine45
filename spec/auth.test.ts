import { describe, expect, inject, it } from "vitest";
import { postForm, signUp } from "./helpers";

// Accounts are native to this app (see README.md) — this covers the actual
// auth mechanics: signup logs you in immediately, a duplicate username is
// rejected without a 500, a wrong password is rejected, and logging out
// actually invalidates the session rather than just clearing the cookie
// client-side.
const baseUrl = inject("baseUrl");

describe("signup", () => {
  it("creates an account and logs the new user in immediately", async () => {
    const username = `auth-signup-${Date.now()}`;
    const cookie = await signUp(baseUrl, username, "correct-horse-battery");
    const res = await fetch(new URL("/", baseUrl), { headers: { Cookie: cookie } });
    const html = await res.text();
    expect(html).toContain(`class="nav-username">${username}<`);
  });

  it("rejects a duplicate username without a 500", async () => {
    const username = `auth-dupe-${Date.now()}`;
    await signUp(baseUrl, username, "correct-horse-battery");

    const res = await postForm(
      baseUrl,
      "/api/auth/signup",
      `username=${username}&password=another-password&returnTo=/`,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/signup/?error=");
  });
});

describe("login", () => {
  it("rejects an incorrect password without logging in", async () => {
    const username = `auth-login-${Date.now()}`;
    await signUp(baseUrl, username, "correct-horse-battery");

    const res = await postForm(baseUrl, "/api/auth/login", `username=${username}&password=totally-wrong&returnTo=/`);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login/?error=");
    expect(res.headers.get("set-cookie")).toBeFalsy();
  });

  it("logs an existing user back in with a fresh session", async () => {
    const username = `auth-relogin-${Date.now()}`;
    await signUp(baseUrl, username, "correct-horse-battery");

    const res = await postForm(
      baseUrl,
      "/api/auth/login",
      `username=${username}&password=correct-horse-battery&returnTo=/`,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toBeTruthy();
  });
});

describe("logout", () => {
  it("invalidates the session so a later authenticated action redirects to login", async () => {
    const cookie = await signUp(baseUrl, `auth-logout-${Date.now()}`, "correct-horse-battery");

    await postForm(baseUrl, "/api/auth/logout", "redirect=/", cookie);

    const res = await postForm(baseUrl, "/api/shortlist/add", "residenceId=1&redirect=/shortlist/", cookie);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login/");
  });
});
