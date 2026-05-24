/* ============================================================
   QUINIELA MUNDIALISTA IA — SERVICE WORKER ZENITH (sw.js)
   ============================================================ */

const CACHE_NAME = "quiniela-ia-cache-v2";
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

// Estrategia Stale-While-Revalidate para CDNs y recursos de alto rendimiento
function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then((cache) => {
    return cache.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      }).catch(() => {
        // Silencio en modo offline
      });
      return cachedResponse || fetchPromise;
    });
  });
}

// Estrategia de Red-First con caída a Caché para API/Firestore, y Caché-First para Assets Estáticos
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Ignorar peticiones de Firebase Firestore/Auth de red
  if (url.origin.includes("firebase") || url.pathname.includes("firestore")) {
    return;
  }

  // Aplicar Stale-While-Revalidate para CDNs externas (Remix Icons, Google Fonts, etc.)
  if (url.origin.includes("jsdelivr") || url.origin.includes("fonts.gstatic.com") || url.origin.includes("fonts.googleapis.com")) {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(e.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        return new Response("Offline Mode Activo en el Cyber Stadium");
      });
    })
  );
});

// ── SUGERENCIA 2: NOTIFICACIONES PUSH SIMULADAS ────────────────────────────
self.addEventListener("push", (e) => {
  let title = "Cyber Stadium Alerta ⚽";
  let body = "¡Un gol ha ocurrido en el Cyber Estadio! Consulta los marcadores.";
  let icon = "./logo-quiniela.png";
  
  if (e.data) {
    try {
      const data = e.data.json();
      title = data.title || title;
      body = data.body || body;
      icon = data.icon || icon;
    } catch (err) {
      body = e.data.text() || body;
    }
  }

  const options = {
    body: body,
    icon: icon,
    badge: icon,
    vibrate: [200, 100, 200],
    data: { url: "./index.html" }
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("index.html") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(e.notification.data.url || "./");
      }
    })
  );
});
