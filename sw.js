/* Service worker: permite abrir la app y los simuladores sin conexión.
   Cuando cambies cualquier archivo, sube el número de VERSION para que
   los móviles descarguen la versión nueva. */
const VERSION = 'v1';
const CACHE = 'simtaller-' + VERSION;
importScripts('catalogo.js');

const BASE = ['./', 'index.html', 'panel.html', 'config.js', 'catalogo.js', 'manifest.webmanifest',
  'css/app.css', 'js/api.js', 'js/app.js', 'js/panel.js', 'js/seguimiento.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon.png', 'icons/apple-touch-icon.png'];
const SIMS = (self.CATALOGO || []).flatMap(s => (s.archivos || ['index.html']).map(f => s.ruta + f));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([...BASE, ...SIMS].map(u =>
    c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('simtaller-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const FUENTES = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // red primero (siempre la versión más nueva); si no hay conexión o tarda más de 4 s, la copia guardada
    e.respondWith((async () => {
      const red = fetch(req).then(r => {
        if (r && r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return r;
      });
      red.catch(() => {});
      try {
        return await Promise.race([red, new Promise((_, no) => setTimeout(() => no(new Error('lento')), 4000))]);
      } catch (err) {
        const guardada = await caches.match(req, { ignoreSearch: true });
        if (guardada) return guardada;
        try { return await red; } catch (err2) {
          return (req.mode === 'navigate' && await caches.match('index.html')) || Response.error();
        }
      }
    })());
  } else if (FUENTES.test(req.url)) {
    // tipografías: copia guardada primero
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); return res; })));
  }
  // el resto (servidor de Google Apps Script) pasa directo, sin caché
});
