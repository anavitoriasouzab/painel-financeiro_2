// Service worker do Painel Financeiro — só cuida do app shell (HTML/CSS/JS/ícones).
// Nunca intercepta chamadas ao Supabase: elas são de outra origem e o fetch handler
// abaixo só mexe em pedidos GET do mesmo domínio.
const CACHE_VERSION = 'pf-shell-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/privacidade.html',
  '/termos.html',
  '/manifest.json',
  '/css/style.css',
  '/css/auth.css',
  '/css/legal.css',
  '/js/storage.js',
  '/js/calculations.js',
  '/js/supabase-config.js',
  '/js/app.js',
  '/js/auth.js',
  '/js/dashboard.js',
  '/js/accounts.js',
  '/js/profile.js',
  '/js/planning.js',
  '/js/goals.js',
  '/js/installments.js',
  '/js/charts.js',
  '/js/simplecharts.js',
  '/js/report.js',
  '/js/backup.js',
  '/js/shader-background.js',
  '/js/voice-expense.js',
  '/assets/pf-favicon.svg',
  '/assets/pf-mark.svg',
  '/assets/pf-mark-adaptive.svg',
  '/assets/pf-mark-currentcolor.svg',
  '/assets/pf-lockup-adaptive.svg',
  '/assets/pwa-icon-192.png',
  '/assets/pwa-icon-512.png',
  '/assets/pwa-icon-maskable-192.png',
  '/assets/pwa-icon-maskable-512.png',
  '/assets/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Só GET, só mesma origem — deixa Supabase, fontes do Google etc. seguirem
  // direto pra rede, sem passar pelo service worker.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Network-first: usuário sempre pega a versão mais nova quando está online
  // (importante num app financeiro — nada de ficar preso num JS desatualizado).
  // A cópia em cache só entra em cena quando a rede falha (offline).
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
  );
});
