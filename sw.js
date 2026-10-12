// Verhoog VERSION bij iedere publicatie. Een update wacht tot de lopende
// sessies sluiten, of de speler in Instellingen voor herladen kiest.
const VERSION = "pennis-v2.0.0";
const BASE = self.registration.scope;
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./court.js",
  "./game.js",
  "./motion.js",
  "./network.js",
  "./config.js",
  "./device.js",
  "./pwa.js",
  "./vendor/vue.js",
  "./vendor/qrcode.js",
  "./manifest.webmanifest",
  "./controller.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
].map((path) => new URL(path, BASE).href);
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("pennis-") && key !== VERSION)
          await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  // Nooit sockets, pairing, cross-origin of andere API-antwoorden cachen.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/signal"
  )
    return;
  const shell = request.mode === "navigate";
  const canonical = new URL(url.pathname, url.origin).href;
  if (!shell && !ASSETS.includes(canonical)) return;
  event.respondWith(
    (async () => {
      // Eén complete versie, zodat een oude pagina nooit nieuwe modules mixt.
      const cache = await caches.open(VERSION);
      const cached = await cache.match(
        shell ? new URL("./index.html", BASE).href : canonical,
      );
      return cached || fetch(request);
    })(),
  );
});
