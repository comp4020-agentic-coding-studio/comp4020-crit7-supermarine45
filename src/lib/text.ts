// Pulls the first http(s) URL out of a free-text note (e.g. a residence's
// applyNote), so a card can link straight to it without a second seed field.
export function extractUrl(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/\S+/);
  return match ? match[0].replace(/[).,]+$/, "") : null;
}
