// The app's own files, kept on the device so it installs like an app and
// opens on a venue's patchy Wi-Fi (Phase 2: installable app, offline scoring).
// Only the app shell is cached. API calls, the live socket and anything from
// another origin always go to the network: tournament data must never be
// served stale from a cache.

const SHELL = 'kt-shell-v1'
const PRECACHE = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return

  // Pages: the network first, so a new deploy is picked up at once; the
  // cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((cache) => cache.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  // Built files carry a content hash in their name, so a cached copy is
  // never out of date: serve it, and fetch and keep any not seen yet.
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok && (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname))) {
        const copy = res.clone()
        caches.open(SHELL).then((cache) => cache.put(request, copy))
      }
      return res
    })),
  )
})
