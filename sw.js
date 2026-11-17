const CACHE_NAME = "orca-sonora-v2";
const ASSETS_ESTATICOS = [
  "./",
  "./index.html",
  "./painel.html",
  "./painel.js",
  "./manifest.json",
  "./logo-orca.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_ESTATICOS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Não faz cache de streams de áudio, APIs do Supabase, ElevenLabs ou Clima
  const url = event.request.url;
  if (
    url.includes("supabase.co") ||
    url.includes("elevenlabs.io") ||
    url.includes("audius.co") ||
    url.includes("open-meteo.com") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});