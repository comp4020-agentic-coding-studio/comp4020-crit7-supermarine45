// Shared by my-accommodation.astro's contract card and contract/[id].astro's
// full document view, so the two pages can't drift into disagreeing about
// what a date or a remaining term reads as.

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function remainingTermLabel(endDate: string | null): string {
  if (!endDate) return "Contract length not published for this room type.";
  const days = Math.ceil((new Date(`${endDate}T00:00:00Z`).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return `Contract ended ${formatDate(endDate)}.`;
  const weeks = Math.round(days / 7);
  return `${days} days left (about ${weeks} ${weeks === 1 ? "week" : "weeks"}), ending ${formatDate(endDate)}.`;
}
