// Service worker do Painel Financeiro — só cuida do app shell (HTML/CSS/JS/ícones).
// Nunca intercepta chamadas ao Supabase: elas são de outra origem e o fetch handler
// abaixo só mexe em pedidos GET do mesmo domínio.
const CACHE_VERSION = 'pf-shell-v2';

// O que vem de CDN e o app precisa pra abrir/funcionar offline. Sem isso,
// um celular que não abria o app online havia uns dias (o navegador já tinha
// descartado a cópia própria dele) abria offline numa tela em branco: sem a
// biblioteca do Supabase o app nem começava. Cache separado do app shell
// pra sobreviver às trocas de CACHE_VERSION.
const CDN_CACHE = 'pf-cdn-v1';
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];
// Baixado já na instalação (o resto — fontes, libs do PDF — entra no
// primeiro uso). Versão fixa, igual à do <script> em index.html/login.html.
const CDN_PRECACHE = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js'];

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
      // Falha da CDN aqui não pode impedir a instalação do app shell.
      .then(() => caches.open(CDN_CACHE).then((cache) => cache.addAll(CDN_PRECACHE)).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION && key !== CDN_CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // CDNs (biblioteca do Supabase, fontes/ícones, libs do PDF): usa a cópia
  // guardada na hora e atualiza por trás (stale-while-revalidate). As URLs
  // têm versão fixa, então a cópia nunca é "outra versão" do arquivo.
  // NUNCA a API do Supabase (*.supabase.co): dado financeiro não passa por
  // cache — a cópia offline dos dados é outra coisa (ver Storage.offline).
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(CDN_CACHE).then((cache) => cache.match(request).then((cached) => {
        const rede = fetch(request)
          .then((response) => {
            if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || rede;
      }))
    );
    return;
  }

  // Resto de outras origens (Supabase etc.) segue direto pra rede.
  if (url.origin !== self.location.origin) return;

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
