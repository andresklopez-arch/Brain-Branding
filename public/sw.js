/* ============================================================
   SELF-DESTRUCTING SERVICE WORKER (RAÍZ DEL SERVIDOR)
   ============================================================ */
self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  self.registration.unregister()
    .then(function() {
      return self.clients.matchAll();
    })
    .then(function(clients) {
      clients.forEach(client => {
        if (client.url && !client.url.includes('/quiniela/')) {
          client.navigate(client.url);
        }
      });
    });
});
