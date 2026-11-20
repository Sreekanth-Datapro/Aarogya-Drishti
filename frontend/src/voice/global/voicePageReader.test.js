import { buildHwPageExplanation, collectVisiblePageHints, isReadPageAgainCommand } from "./voicePageReader";
import { resolveHwPageGuideId, getHwPagePurposeText } from "./voicePageGuide";

describe("voicePageGuide purposes", () => {
  test("includes registration and dashboard", () => {
    expect(resolveHwPageGuideId("/health-worker/patients")).toBe("registration");
    expect(getHwPagePurposeText("/dashboard", "en")?.text).toMatch(/Dashboard/i);
    expect(getHwPagePurposeText("/health-worker/screening", "te")?.text).toMatch(/స్క్రీనింగ్/);
  });
});

describe("isReadPageAgainCommand", () => {
  test("detects English and Telugu re-read phrases", () => {
    expect(isReadPageAgainCommand("Read this page again")).toBe(true);
    expect(isReadPageAgainCommand("explain this page")).toBe(true);
    expect(isReadPageAgainCommand("పేజీ మళ్లీ చదువు")).toBe(true);
    expect(isReadPageAgainCommand("Open Screening")).toBe(false);
  });
});

describe("collectVisiblePageHints", () => {
  test("reads stats and skips patient-like rows", () => {
    document.body.innerHTML = `
      <main>
        <h1 class="page-title">Screening</h1>
        <p class="page-subtitle">Record consent and findings</p>
        <article class="stat-card">
          <p class="stat-label">My patients</p>
          <p class="stat-value">12</p>
        </article>
        <h2>Consent</h2>
        <button class="btn btn-primary">Save and continue</button>
        <li>QA Patient AD-2026-000032 · 45 · Male · Demo Village</li>
      </main>
    `;
    const hints = collectVisiblePageHints(document);
    expect(hints.title).toBe("Screening");
    expect(hints.stats).toEqual(["My patients: 12"]);
    expect(hints.headings).toContain("Consent");
    expect(hints.actions).toContain("Save and continue");
    expect(hints.stats.join(" ")).not.toMatch(/AD-2026/);
  });
});

describe("buildHwPageExplanation", () => {
  test("combines purpose with visible stats", () => {
    document.body.innerHTML = `
      <main>
        <h1 class="page-title">Dashboard</h1>
        <article class="stat-card">
          <p class="stat-label">My patients</p>
          <p class="stat-value">3</p>
        </article>
      </main>
    `;
    const result = buildHwPageExplanation("/dashboard", "en", document);
    expect(result.id).toBe("dashboard");
    expect(result.text).toMatch(/Health Worker Dashboard/i);
    expect(result.text).toMatch(/My patients: 3/);
  });
});
