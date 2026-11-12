const fs = require("fs");
const path = require("path");

describe("service worker offline shell policy", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../../public/service-worker.js"),
    "utf8"
  );

  test("uses cache version v7", () => {
    expect(source).toContain('aarogya-drishti-v7');
  });

  test("never intercepts /api/ traffic", () => {
    expect(source).toMatch(/pathname\.startsWith\("\/api\/"\)/);
    expect(source).toMatch(/if \(url\.pathname\.startsWith\("\/api\/"\)\) return;/);
  });

  test("navigate fallback prefers SPA shell before offline.html", () => {
    const navigateBlock = source.slice(source.indexOf('request.mode === "navigate"'));
    const shellIdx = navigateBlock.indexOf('caches.match("/index.html")');
    const offlineIdx = navigateBlock.indexOf("caches.match(OFFLINE_URL)");
    expect(shellIdx).toBeGreaterThan(-1);
    expect(offlineIdx).toBeGreaterThan(shellIdx);
  });

  test("activation deletes old Cache Storage keys without referencing IndexedDB drafts", () => {
    expect(source).toMatch(/keys\.filter\(\(key\) => key !== CACHE_NAME\)/);
    expect(source).toMatch(/pending encrypted registration drafts/);
    expect(source).not.toMatch(/indexedDB\.deleteDatabase|aarogya-offline/);
  });

  test("production build service-worker.js matches v7 policy when build/ exists", () => {
    const buildPath = path.join(__dirname, "../../build/service-worker.js");
    if (!fs.existsSync(buildPath)) return;
    const built = fs.readFileSync(buildPath, "utf8");
    expect(built).toContain("aarogya-drishti-v7");
    expect(built).toMatch(/if \(url\.pathname\.startsWith\("\/api\/"\)\) return;/);
    expect(built).not.toMatch(/indexedDB\.deleteDatabase|aarogya-offline/);
  });
});
