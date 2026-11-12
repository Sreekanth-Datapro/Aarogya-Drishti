/**
 * Production service-worker registration with update + logout cache helpers.
 * Caches only the app shell / static assets (see public/service-worker.js).
 */

const DISMISS_KEY = "pwaInstallDismissedAt";
const DISMISS_DAYS = 14;

export function wasInstallDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function rememberInstallDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // ignore storage failures
  }
}

export function isStandaloneDisplay() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export function clearServiceWorkerCaches() {
  if (!("serviceWorker" in navigator)) return Promise.resolve();
  return navigator.serviceWorker.getRegistration().then((registration) => {
    if (registration?.active) {
      registration.active.postMessage({ type: "CLEAR_CACHES" });
    }
    if ("caches" in window) {
      return caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
    }
    return undefined;
  }).catch(() => undefined);
}

/**
 * @param {{ onUpdateAvailable?: (applyUpdate: () => void) => void }} options
 */
export function registerServiceWorker(options = {}) {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              const applyUpdate = () => {
                if (registration.waiting) {
                  registration.waiting.postMessage({ type: "SKIP_WAITING" });
                }
                let refreshing = false;
                navigator.serviceWorker.addEventListener("controllerchange", () => {
                  if (refreshing) return;
                  refreshing = true;
                  window.location.reload();
                });
              };
              if (typeof options.onUpdateAvailable === "function") {
                options.onUpdateAvailable(applyUpdate);
              }
            }
          });
        });
      })
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  });
}
