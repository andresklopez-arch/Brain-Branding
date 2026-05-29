/* ============================================================
   QUINIELA MUNDIALISTA IA — SERVICE WORKER ZENITH (sw.js)
   ============================================================ */

const CACHE_NAME = "quiniela-ia-cache-v20";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
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
      // Generar peticiones que fuercen la recarga desde la red para evitar cachear archivos viejos
      const requests = ASSETS_TO_CACHE.map(url => {
        return new Request(url, { cache: "reload" });
      });
      return cache.addAll(requests);
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
  if (url.origin.includes("firebase") || url.pathname.includes("firestore") || url.pathname.includes("identitytoolkit")) {
    return;
  }

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cachedResponse) => {
      // Si está cacheado (por ejemplo, assets estáticos index.css, app.js), lo servimos de inmediato
      if (cachedResponse) {
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
      }).catch((err) => {
        // Si falla la red y es una navegación de página principal (HTML), retornar index.html
        if (e.request.mode === "navigate") {
          return caches.match("./index.html", { ignoreSearch: true });
        }
        // Para otros recursos (CSS, JS, imágenes), lanzar el error de red para no romper tipos MIME
        throw err;
      });
    })
  );
});
