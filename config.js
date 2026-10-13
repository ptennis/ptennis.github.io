export const SIGNALING_WORKER = "https://webrtc-signaling.zoute-popcorn.workers.dev";

export function signalingURL(page = location) {
  const isLocal = page.hostname === "localhost" || page.hostname === "127.0.0.1";
  const url = new URL(
      "/signal",
      isLocal ? page.href : SIGNALING_WORKER,
  );
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}