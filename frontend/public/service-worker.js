/* Aarogya Drishti service worker — app shell only. Never cache PHI/API/auth. */
const CACHE_NAME = "aarogya-drishti-v7";
const OFFLINE_URL = "/offline.html";

const APP_SHELL = [
  "/",
  "/index.html",
  OFFLINE_URL,
  "/manifest.json",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
];

async function putShellEntry(cache, path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    console.error("[aarogya-sw] precache HTTP failure", path, response.status);
    return false;
  }
  // Reject SPA fallback mistaken for the offline page
  if (path === OFFLINE_URL) {
    const text = await response.clone().text();
    if (!text.includes("You are offline")) {
      console.error("[aarogya-sw] offline.html looks like SPA index; not cached");
      return false;
    }
  }
  await cache.put(path, response);
  return true;
}

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  // Offline page first — required for safe offline navigations
  await putShellEntry(cache, OFFLINE_URL);
  for (const path of APP_SHELL) {
    if (path === OFFLINE_URL) continue;
    await putShellEntry(cache, path);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().catch((error) => {
    console.error("[aarogya-sw] install precache:", error);
  }));
});

self.addEventListener("activate", (event) => {
  // Drop only Cache Storage shells (v3–v6, etc.). Never touch IndexedDB —
  // pending encrypted registration drafts live outside Cache Storage.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => precacheShell())
        .catch(() => undefined)
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API traffic (patient/clinical/auth data stays network-only)
  if (url.pathname.startsWith("/api/")) return;

  // Always prefer network for the offline document itself so hosts that rewrite
  // *.html to the SPA cannot permanently poison the cache.
  if (url.pathname === OFFLINE_URL) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const text = await response.clone().text();
            if (text.includes("You are offline")) {
              const cache = await caches.open(CACHE_NAME);
              cache.put(OFFLINE_URL, response.clone());
            }
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(OFFLINE_URL);
          return cached || Response.error();
        })
    );
    return;
  }

  // Navigations: network first; prefer SPA shell so offline React routes work.
  // Fall back to offline.html only when the shell itself is missing.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(async () => {
          const shell = await caches.match("/index.html");
          if (shell) return shell;
          const offline = await caches.match(OFFLINE_URL);
          return offline || Response.error();
        })
    );
    return;
  }

  // Cache only static application assets (CSS/JS/icons). Never HTML app routes or APIs.
  const isStaticAsset =
    url.pathname.startsWith("/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json";

  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return cached || Response.error();
      }
    })
  );
});
