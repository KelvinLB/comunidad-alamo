/* Alerta Pantepec: guarda la página en el teléfono para que abra sin señal o con internet muy lento.
   data.json NO pasa por aquí: la página lo pide siempre a la red y, si falla, muestra la última
   revisión guardada con el aviso "Sin conexión". Así nunca se hace pasar un dato viejo por nuevo.
   Si se cambia la lista BASE o la forma de guardar, suba la VERSION. */
'use strict';
const VERSION = 'alerta-v1';
const BASE = ['./', 'app.js?v=2', 'geo.json', 'icono.svg', 'manifest.webmanifest', 'icono-192.png'];
const ESPERA_MS = 3500;  // con internet muy lento se abre lo guardado y se actualiza por detrás

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('alerta-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function guardar(clave, r) {
  if (r && (r.ok || r.type === 'opaque')) {
    const copia = r.clone();
    caches.open(VERSION).then(c => c.put(clave, copia));
  }
  return r;
}

// Primero la red. Si tarda más de ESPERA_MS o falla, lo guardado (si hay).
function redPrimero(req, clave) {
  return new Promise((resolve, reject) => {
    let hecho = false;
    const fin = r => { if (!hecho && r) { hecho = true; resolve(r); } };
    const t = setTimeout(() => caches.match(clave).then(fin), ESPERA_MS);
    fetch(req).then(r => {
      clearTimeout(t);
      if (r.ok) fin(guardar(clave, r));
      else caches.match(clave).then(c => fin(c || r));
    }).catch(() => {
      clearTimeout(t);
      caches.match(clave).then(c => c ? fin(c) : hecho || reject(new TypeError('Sin conexión')));
    });
  });
}

// Letras de Google: se guardan la primera vez y ya no se vuelven a bajar (ahorra datos)
const guardadoPrimero = req => caches.match(req).then(c => c || fetch(req).then(r => guardar(req, r)));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (/\/(data\.json|sw\.js)$/.test(u.pathname)) return;  // siempre a la red
    // la página es la misma con cualquier ?c= o ?demo=; la lee app.js
    if (req.mode === 'navigate') return e.respondWith(redPrimero(req, './'));
    return e.respondWith(redPrimero(req, req));
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') e.respondWith(guardadoPrimero(req));
  // lo demás (mapa con calles de OpenStreetMap, Leaflet) va directo a la red
});
