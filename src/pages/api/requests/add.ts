import type { APIRoute } from "astro";
import { addResidentRequest, getActiveContract, type ResidentRequestKind } from "../../../lib/db";
import { safeRedirect } from "../../../lib/http";

const KINDS = new Set<string>(["maintenance", "ra_message"]);

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const redirectTo = safeRedirect(form.get("redirect"), "/my-accommodation/");
  if (!locals.user) return redirect(`/login/?returnTo=${encodeURIComponent(redirectTo)}`, 303);

  // The active contract is looked up from the session, never trusted from
  // the form — a posted contractId could otherwise attach a request to
  // someone else's contract.
  const contract = getActiveContract(locals.user.id);
  const kindRaw = String(form.get("kind") ?? "");
  const message = String(form.get("message") ?? "").trim();
  const category = String(form.get("category") ?? "").trim() || null;

  if (contract && KINDS.has(kindRaw) && message.length > 0) {
    addResidentRequest(contract.id, kindRaw as ResidentRequestKind, category, message);
  }
  return redirect(redirectTo, 303);
};
