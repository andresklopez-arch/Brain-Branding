/* ============================================================
   QUINIELA MUNDIALISTA IA — SERVICE WORKER ZENITH (sw.js)
   ============================================================ */

const CACHE_NAME = "quiniela-ia-cache-v15";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html?v=" + Date.now(),
  "./index.css",
  "./app.js",
  "./app_db.js",
  "./manifest.json",
  "./logo-quiniela.png"
];

// Instalar Service Worker y precargar recursos esenciales
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("⚙️ [Service Worker] Cacheando assets esenciales...");
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activar y limpiar cachés antiguas
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("⚙️ [Service Worker] Eliminando caché obsoleta:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estrategia de Red-First con caída a Caché para API/Firestore, y Caché-First para Assets Estáticos
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Ignorar peticiones de Firebase Firestore/Auth de red
  if (url.origin.includes("firebase") || url.pathname.includes("firestore")) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Retornar recurso cacheado
        return cachedResponse;
      }

      // Si no está cacheado, hacer la petición a la red
      return fetch(e.request).then((networkResponse) => {
        // No cachear peticiones no exitosas o de orígenes externos
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }

        // Cachear dinámicamente nuevos archivos del mismo dominio
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Retornar fallback básico si no hay red
        return new Response("Offline Mode Activo en el Quiniela Mundialista");
      });
    })
  );
});
