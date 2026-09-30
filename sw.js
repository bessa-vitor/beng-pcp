/* BENG PCP — Service Worker
   Guarda o app e as bibliotecas (visual, Firebase, fontes) no aparelho para abrir sem internet.
   Os dados em si ficam no cache offline do Firestore; aqui não passam requisições de dados. */
const VERSAO = 'beng-pcp-v1';
const APP = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const EXTERNOS = [
  /^https:\/\/cdn\.tailwindcss\.com\//,
  /^https:\/\/www\.gstatic\.com\/firebasejs\//,
  /^https:\/\/fonts\.googleapis\.com\//,
  /^https:\/\/fonts\.gstatic\.com\//,
  /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\//
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSAO);
    await Promise.all(APP.map(u => c.add(u).catch(() => {})));
    await c.add(new Request('https://cdn.tailwindcss.com/', { mode: 'no-cors' })).catch(() => {});
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSAO) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Página do app: tenta a versão nova na rede (até 4s); sem sinal, usa a guardada
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(VERSAO);
      const rede = fetch(req).then(r => { if (r.ok) c.put('./index.html', r.clone()); return r; });
      rede.catch(() => {});
      try {
        return await Promise.race([rede, new Promise((_, rej) => setTimeout(() => rej('timeout'), 4000))]);
      } catch (_) {
        return (await c.match('./index.html')) || (await c.match('./')) || rede;
      }
    })());
    return;
  }

  // Arquivos do próprio app (ícones, manifest)
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok) caches.open(VERSAO).then(c => c.put(req, res.clone()));
      return res;
    })));
    return;
  }

  // Bibliotecas externas: usa a guardada na hora e atualiza em segundo plano
  if (EXTERNOS.some(re => re.test(req.url))) {
    e.respondWith((async () => {
      const c = await caches.open(VERSAO);
      const guardada = await c.match(req);
      const rede = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => null);
      return guardada || (await rede) || Response.error();
    })());
  }
  // Demais requisições (Firestore, login) seguem direto para a rede
});
