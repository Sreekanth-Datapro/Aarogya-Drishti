import {
  isStandaloneDisplay,
  rememberInstallDismissed,
  wasInstallDismissedRecently,
} from "./registerServiceWorker";

describe("PWA install dismissal helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("records and detects recent install dismissal", () => {
    expect(wasInstallDismissedRecently()).toBe(false);
    rememberInstallDismissed();
    expect(wasInstallDismissedRecently()).toBe(true);
  });

  test("standalone detection uses matchMedia when available", () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    expect(isStandaloneDisplay()).toBe(true);
    window.matchMedia = original;
  });
});
