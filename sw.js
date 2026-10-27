/* 气功学堂 · Service Worker：预缓存全部静态资源，stale-while-revalidate */
var CACHE = 'qigong-v1.9.0';
var ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/style.css',
  './js/data.js', './js/store.js', './js/app.js', './js/scene.js',
  './vendor/three.module.js', './vendor/addons/controls/OrbitControls.js',
  './assets/icon-192.png', './assets/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(ASSETS.map(function (u) {
      return fetch(u).then(function (r) { return c.put(u, r); }).catch(function () { /* 单资源失败不阻塞 */ });
    }));
  })); /* 不立即 skipWaiting：由页面提示用户确认后发消息再跳 */
});

self.addEventListener('message', function (e) {
  if (e.data === 'skip') self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* 外部请求不拦截（本应无外部请求） */
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(req, { ignoreSearch: false }).then(function (hit) {
        var net = fetch(req).then(function (r) {
          if (r && r.ok) c.put(req, r.clone()); /* 后台更新缓存 */
          return r;
        }).catch(function () { return hit; });
        return hit || net;
      });
    })
  );
});
