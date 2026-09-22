import { defineMiddleware } from "astro:middleware";
import { getUserByToken, SESSION_COOKIE } from "./lib/auth";

// Resolves the session cookie once per request so every page and API route
// can read `context.locals.user` directly, the same way Nav.astro already
// reads `Astro.url.pathname` without anything passing it in as a prop.
export const onRequest = defineMiddleware((context, next) => {
  context.locals.user = getUserByToken(context.cookies.get(SESSION_COOKIE)?.value);
  return next();
});
