// Shared by every API route that redirects back to a same-site path taken
// from a form field: never trust it to be an absolute or protocol-relative
// URL a form could be tampered into.
export function safeRedirect(value: FormDataEntryValue | null, fallback = "/"): string {
  const path = String(value ?? "");
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}
