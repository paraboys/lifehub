const CACHE_NAME = "lifehub-pwa-v3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon.ico",
  "/lh-logo.svg",
  "/lh-maskable.svg",
  "/offline.html"
];
const STATIC_DESTINATIONS = new Set(["style", "script", "worker", "image", "font"]);
const SKIP_CACHE_PREFIXES = ["/api", "/socket.io", "/src/", "/node_modules/", "/@vite", "/@react-refresh"];

function shouldSkipCache(url) {
  return SKIP_CACHE_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
}

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      cache.put("/", response.clone());
      cache.put("/index.html", response.clone());
    }

    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    const shell = await cache.match("/");
    if (shell) {
      return shell;
    }

    return cache.match("/offline.html");
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  const isHtmlNavigation = event.request.mode === "navigate";
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isStaticAsset =
    requestUrl.pathname.startsWith("/assets/")
    || STATIC_DESTINATIONS.has(event.request.destination)
    || APP_SHELL.includes(requestUrl.pathname);

  if (!isSameOrigin || shouldSkipCache(requestUrl)) {
    return;
  }

  if (isHtmlNavigation) {
    event.respondWith(handleNavigation(event.request));
    return;
  }

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(handleStaticAsset(event.request));
});
