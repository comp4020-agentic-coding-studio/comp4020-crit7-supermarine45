import type { APIRoute } from "astro";
import { addToShortlist } from "../../../lib/db";

// Safe redirect target: only ever a path on this same site, never an
// absolute or protocol-relative URL a form field could be tampered into.
function safeRedirect(value: FormDataEntryValue | null): string {
  const path = String(value ?? "");
  return path.startsWith("/") && !path.startsWith("//") ? path : "/search/";
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const residenceId = Number(form.get("residenceId"));
  if (Number.isInteger(residenceId)) addToShortlist(residenceId);
  return redirect(safeRedirect(form.get("redirect")), 303);
};
