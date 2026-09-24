import type { APIRoute } from "astro";

// OpenStreetMap's tile usage policy (operations.osmfoundation.org/policies/tiles)
// requires a custom User-Agent that identifies the calling application — a
// header a browser-issued <img>/tile request can never send, since browsers
// don't let page JS override it. Every third-party CDN we tried instead
// (tile.openstreetmap.org directly, then CARTO's free basemaps) turned out to
// silently block or paywall that traffic. Proxying through our own server,
// which *can* set the header, is the policy's own documented way to serve
// OSM tiles to a browser-based map, so it isn't a workaround, and Fly-hosted
// responses get the browser's normal HTTP cache for free.
const USER_AGENT =
  "ANU-Residence-Explorer-COMP4020-prototype (+https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-supermarine45)";

export const GET: APIRoute = async ({ params }) => {
  const { z, x, y } = params;
  if (!/^\d+$/.test(z ?? "") || !/^\d+$/.test(x ?? "") || !/^\d+$/.test(y ?? "")) {
    return new Response(null, { status: 400 });
  }

  const upstream = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "image/png",
      // Matches OSM's own guidance to cache tiles rather than re-request
      // them; a given z/x/y tile's imagery doesn't change week to week.
      "Cache-Control": "public, max-age=604800",
    },
  });
};
