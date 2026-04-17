const CACHE_STATIC = 'pwa-static-v3';
const CACHE_DYNAMIC = 'pwa-dynamic-v3';
const OFFLINE_URL = './index.html';
const TEMP_PREVIEW_URL = '/dynamic-preview'; 

let dynamicContent = {};

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './512.png',
  './192.png',
  // CodeMirror i biblioteki zewnętrzne
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/codemirror.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/theme/dracula.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/addon/fold/foldgutter.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/addon/dialog/dialog.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/codemirror.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/mode/xml/xml.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/mode/javascript/javascript.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/mode/css/css.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/mode/htmlmixed/htmlmixed.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/mode/clike/clike.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/addon/edit/matchbrackets.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/addon/edit/closebrackets.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/addon/selection/active-line.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/addon/fold/foldcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/addon/fold/foldgutter.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/addon/dialog/dialog.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/addon/search/searchcursor.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/addon/search/search.min.js'
];

// Instalacja - bezpieczniejsze pobieranie
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      console.log('SW: Próba buforowania zasobów...');
      // Używamy mapy, aby jeden błąd 404 nie wywalił całego SW
      return Promise.all(
        urlsToCache.map(url => {
          return cache.add(url).catch(err => console.error(`Błąd buforowania: ${url}`, err));
        })
      );
    })
  );
  self.skipWaiting();
});

// Aktywacja - czyszczenie starego cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_STATIC && key !== CACHE_DYNAMIC)
          .map(key => caches.delete(key))
    ))
  );
  return self.clients.claim();
});

// Obsługa komunikatów
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'OPEN_PREVIEW_WINDOW') {
        const contentKey = `preview-${Date.now()}`; 
        dynamicContent[contentKey] = event.data.content;
        event.waitUntil(
            self.clients.openWindow(`${TEMP_PREVIEW_URL}?key=${contentKey}`)
        );
    }
});

// Fetch - Strategia Cache-First z fallbackiem
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 1. Obsługa dynamicznego podglądu
    if (url.pathname === TEMP_PREVIEW_URL) {
        const key = url.searchParams.get('key');
        const content = dynamicContent[key] || '<h1>Błąd wczytywania podglądu (Offline).</h1>';
        event.respondWith(new Response(content, { headers: { 'Content-Type': 'text/html' } }));
        delete dynamicContent[key]; 
        return;
    }

    // 2. Obsługa plików GET
    if (event.request.method === 'GET' && url.protocol.startsWith('http')) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then(cachedRes => {
                // Jeśli jest w cache, zwróć go natychmiast
                if (cachedRes) return cachedRes;

                // Jeśli nie ma, spróbuj pobrać z sieci i zapisz do dynamicznego cache
                return fetch(event.request).then(networkRes => {
                    if (!networkRes || networkRes.status !== 200 || networkRes.type !== 'basic') {
                        return networkRes;
                    }
                    const resToCache = networkRes.clone();
                    caches.open(CACHE_DYNAMIC).then(cache => cache.put(event.request, resToCache));
                    return networkRes;
                }).catch(() => {
                    // Fallback dla braku sieci i braku w cache
                    if (event.request.mode === 'navigate') {
                        return caches.match(OFFLINE_URL);
                    }
                });
            })
        );
    }
});
