const CACHE_NAME = "orca-sonora-v4";
const ASSETS_ESTATICOS = [
  "./",
  "./index.html",
  "./painel.html",
  "./painel.js",
  "./manifest.json",
  "./logo-orca.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_ESTATICOS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Ignora qualquer pedido que não seja GET (como o POST do /api/tts)
  if (event.request.method !== "GET") {
    return;
  }

  // 2. Ignora chamadas para a API do backend ou domínios externos (Supabase, etc.)
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname !== self.location.hostname
  ) {
    return;
  }

  // 3. Para os arquivos do próprio painel: tenta buscar na rede primeiro e usa o cache se falhar (ou vice-versa)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Atualiza o cache com a versão mais nova do arquivo
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => {
        // Se estiver sem internet, entrega o arquivo salvo no cache
        return caches.match(event.request);
      })
  );
});