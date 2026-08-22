/* 라운딩 다이어리 - 최소 서비스워커
   같은 출처(GitHub Pages)의 앱 화면 파일만 캐시해서 오프라인에서도 앱 껍데기가 뜨게 해준다.
   구글시트(Apps Script)로 가는 요청은 그대로 통과시켜 항상 최신 데이터를 받는다.

   v2에서 바뀐 점: 예전엔 index.html도 "캐시에 있으면 무조건 그것부터 보여주고, 새 버전은
   다음 방문을 위해 조용히 백그라운드에서만 받아두는" 방식이라, GitHub에서 index.html을
   새로 올려도 홈 화면 앱(설치된 PWA)에는 한 박자 늦게(또는 안 켜질 때까지 계속) 반영이
   안 되는 문제가 있었다. index.html(=앱의 뼈대이자 로직 전체)은 네트워크를 먼저 시도해서
   온라인이면 항상 최신 버전을 받아오고, 오프라인일 때만 캐시로 대체하도록 바꿨다.
   아이콘처럼 거의 안 바뀌는 정적 파일은 기존처럼 캐시 우선 방식을 유지한다. */
const CACHE = 'golf-diary-v2';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return; // 외부(Apps Script) 요청은 그대로 통과

  const isShell = e.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
  if (isShell) {
    // 앱 뼈대(index.html)는 네트워크 우선: 온라인이면 항상 최신 버전을 받아온다.
    e.respondWith(
      fetch(e.request).then((res) => {
        caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 그 외 정적 파일(아이콘 등)은 캐시 우선 + 백그라운드 갱신 (오프라인 대비).
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((res) => {
        caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
