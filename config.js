// GitHub Pages gebruikt dezelfde Cloudflare Worker als het oorspronkelijke spel.
// Verander alleen dit adres als jouw Worker een andere naam heeft gekregen.
export const SIGNALING_WORKER =
  "https://webrtc-signaling.zoute-popcorn.workers.dev";

export function signalingURL(page = location) {
  const separateHosting = page.hostname.endsWith(".github.io");
  const url = new URL(
    "/signal",
    separateHosting ? SIGNALING_WORKER : page.href,
  );
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}
