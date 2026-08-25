/* 라운딩 다이어리 - 최소 서비스워커
   같은 출처(GitHub Pages)의 앱 화면 파일만 캐시해서 오프라인에서도 앱 껍데기가 뜨게 해준다.
   구글시트(Apps Script)로 가는 요청은 그대로 통과시켜 항상 최신 데이터를 받는다.

   v2에서 바뀐 점: 예전엔 index.html도 "캐시에 있으면 무조건 그것부터 보여주고, 새 버전은
   다음 방문을 위해 조용히 백그라운드에서만 받아두는" 방식이라, GitHub에서 index.html을
   새로 올려도 홈 화면 앱(설치된 PWA)에는 한 박자 늦게(또는 안 켜질 때까지 계속) 반영이
   안 되는 문제가 있었다. index.html(=앱의 뼈대이자 로직 전체)은 네트워크를 먼저 시도해서
   온라인이면 항상 최신 버전을 받아오고, 오프라인일 때만 캐시로 대체하도록 바꿨다.
   아이콘처럼 거의 안 바뀌는 정적 파일은 기존처럼 캐시 우선 방식을 유지한다.

   v3에서 바뀐 점: v2의 "네트워크 우선"이 실제로는 브라우저의 일반 HTTP 캐시(및
   GitHub Pages CDN 캐시)에서 응답을 그대로 받아와 버리는 경우가 있어서, index.html을
   새로 올려도 새로고침을 여러 번 해도 예전 화면이 계속 보이는 문제가 있었다. index.html
   요청에 { cache: 'no-store' }를 강제로 붙여서 항상 서버까지 진짜로 새로 요청하도록 했다.

   v4에서 바뀐 점: 아이폰 등에서 홈 화면에 설치한 앱은 Safari(브라우저)와 완전히 분리된
   자기만의 저장공간을 쓴다 — 그래서 "브라우저 캐시를 지워주세요"라고 안내해도 홈 화면
   앱 쪽은 전혀 영향을 안 받는 경우가 있었다. 그래서 사용자가 수동으로 캐시를 지우게
   만드는 대신, 앱이 스스로 새 버전을 감지하면 자동으로 새로고침까지 하도록 index.html
   쪽에 로직을 추가했고(reg.update(), controllerchange → location.reload()), 여기서는
   그 로직이 새 서비스워커를 즉시 활성화할 수 있도록 SKIP_WAITING 메시지를 받으면
   self.skipWaiting()을 호출하게 했다. */
const CACHE = 'golf-diary-v4';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
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
    // 앱 뼈대(index.html)는 네트워크 우선 + no-store: 브라우저/CDN 캐시를 거치지 않고
    // 온라인이면 항상 서버의 진짜 최신 버전을 받아온다.
    e.respondWith(
      fetch(e.request.url, { cache: 'no-store' }).then((res) => {
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
