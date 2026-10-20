/* sw.js — Service Worker: يخلي رفيقي يشتغل بدون نت (الهيكل فقط) */
const CACHE = "rafiqi-v1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "icon.svg", "css/style.css",
  "js/core.js", "js/store.js", "js/weather.js", "js/app.js",
  "js/views/dashboard.js", "js/views/tasks.js", "js/views/money.js", "js/views/weather.js", "js/views/settings.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // طلبات الـ API (طقس/صلاة) تروح للشبكة مباشرة، والكاش لها يديره التطبيق نفسه
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // network-first للملفات المحلية عشان التحديثات توصل، ونرجع للكاش لو ما فيه نت
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
  );
});
