const CACHE_NAME = 'bytecore-v' + Date.now(); // Gera um nome único para cada versão

self.addEventListener('install', (event) => {
    // Força o Service Worker novo a assumir o controle imediatamente
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Limpa caches antigos
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Estratégia: Tenta rede primeiro, se falhar ou estiver offline, não faz nada (deixa o navegador lidar)
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
