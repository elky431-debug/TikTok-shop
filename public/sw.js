/*
 * Service worker de l'appli installable (bloc 15).
 *
 * - Pages (navigations) : réseau d'abord ; si le réseau ne répond pas, la dernière version vue de la page ; sinon la
 *   page hors ligne. Seules les vraies pages du site sont gardées (réponse 200, sans redirection), jamais l'admin,
 *   l'authentification, l'API ni la désinscription.
 * - Ressources statiques : cache d'abord, pour les fichiers immuables de Next (/_next/static, marqués « immutable »),
 *   les icônes et la police. En développement, ces fichiers ne sont pas immuables : rien n'est gardé.
 * - Déconnexion (POST /auth/deconnexion) et compte supprimé : les pages gardées sont effacées et l'abonnement push de
 *   l'appareil est résilié, pour qu'un appareil partagé ne garde rien du compte.
 * - Notifications push : affichage (titre, texte, lien) et ouverture de la bonne page au clic.
 * Aucune requête POST, action serveur ou requête de données (RSC) n'est mise en cache.
 */
const VERSION = 'v1';
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
const OFFLINE_URL = '/hors-ligne';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/badge-96.png'];
const NO_CACHE_PREFIXES = ['/admin', '/auth', '/api', '/connexion', '/desinscription', '/compte-supprime', '/r/'];
const MAX_PAGES = 60;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== PAGES && key !== STATIC).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function forgetAccount() {
  await caches.delete(PAGES);
  const subscription = await self.registration.pushManager.getSubscription().catch(() => null);
  if (subscription) await subscription.unsubscribe().catch(() => undefined);
}

// Message de la page (suppression du compte) : même effacement qu'à la déconnexion.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'oublier-compte') event.waitUntil(forgetAccount());
});

function cacheablePage(url) {
  return !NO_CACHE_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
}

async function trimPages() {
  const cache = await caches.open(PAGES);
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(request);
}

async function networkFirstPage(event, url) {
  try {
    const response = await fetch(event.request);
    if (response.ok && !response.redirected && response.type === 'basic' && cacheablePage(url)) {
      const copy = response.clone();
      event.waitUntil(
        caches
          .open(PAGES)
          .then((cache) => cache.put(url.pathname + url.search, copy))
          .then(trimPages),
      );
    }
    return response;
  } catch (error) {
    const cached = (await caches.match(url.pathname + url.search, { cacheName: PAGES })) || (await caches.match(url.pathname, { cacheName: PAGES }));
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    throw error;
  }
}

async function cacheFirstStatic(event) {
  const cached = await caches.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  const immutable = /immutable/.test(response.headers.get('cache-control') || '');
  if (response.ok && response.type === 'basic' && immutable) {
    const copy = response.clone();
    event.waitUntil(caches.open(STATIC).then((cache) => cache.put(event.request, copy)));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === 'POST' && url.pathname === '/auth/deconnexion') {
    event.waitUntil(forgetAccount());
    return;
  }
  if (url.pathname === '/compte-supprime') event.waitUntil(forgetAccount());
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(event, url));
    return;
  }
  // Données des pages (RSC) et API : toujours le réseau.
  if (request.headers.get('RSC') || url.searchParams.has('_rsc') || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || /\.(?:woff2|png|svg)$/.test(url.pathname)) {
    event.respondWith(cacheFirstStatic(event));
  }
});

// ---------------------------------------------------------------------------
// Notifications push
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Nouvelle notification';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      lang: 'fr',
      tag: data.tag || undefined,
      data: { url: data.url || '/app/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/app/notifications', self.location.origin);
  // Jamais d'ouverture hors du site.
  const url = target.origin === self.location.origin ? target.href : `${self.location.origin}/app/notifications`;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) return client.navigate(url).catch(() => self.clients.openWindow(url));
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
