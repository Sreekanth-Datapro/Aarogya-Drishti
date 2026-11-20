# Android PWA Conversion Report

## Summary

Added a mobile app shell for signed-in users while retaining the existing desktop sidebar and role-based workflows. The change is presentation-only; it does not alter patient, screening, appointment, tracking, or administration APIs.

## Pages and grids

- Applied the mobile shell and compact spacing across signed-in routes.
- Changed dashboard KPI and summary cards to two-column phone grids, with a single column below 360 px; retained wider tablet and desktop grids.
- Added two-column phone grids for administration metric cards.
- Preserved the existing mobile-specific patient, appointment, screening, and tracking card/form layouts, with shared overflow and card spacing rules.
- Kept long tables in their existing horizontal-scroll wrappers.

## Navigation

- Added a bottom bar with Dashboard and up to three role-appropriate shortcuts.
- The shortcuts come from the existing permission-filtered navigation catalog. System Administrator shortcuts remain aligned with the existing sidebar.
- Secondary routes remain in the existing hamburger drawer; the desktop sidebar is unchanged.
- Added English and Telugu labels for the mobile navigation landmark.

## PWA and privacy

- The existing manifest specifies `display: standalone`, app colors, portrait-capable `orientation: any`, and 192 px, 512 px, and maskable icons. All referenced icon files were present.
- The app already uses `viewport-fit=cover`; safe-area insets are applied to the document, drawer, and mobile navigation.
- The existing service worker caches the app shell/static resources and bypasses `/api/` requests. No private API responses or patient data are added to browser cache.
- Hardened standalone detection for browsers and test environments without `matchMedia`.
- **Installation status:** manifest, icon paths, and service-worker policy were inspected locally. An actual Android Chrome installation or `beforeinstallprompt` flow was not available to verify.

## Testing performed

- Focused Jest run: **5 suites and 20 tests passed**, covering mobile navigation permissions, role navigation, dashboard, service-worker cache policy, and standalone detection.
- Production frontend build completed successfully.
- Browser viewport smoke checks at **360×800, 375×812, 390×844, 430×932, 834×1112, and 1366×768** found no horizontal overflow. Representative navigation and KPI grid CSS showed phone tabs/two-column stats, tablet navigation hidden/two-column stats, and desktop navigation hidden/four-column stats. The browser was not authenticated, so these checks did not exercise signed-in workflows end to end.
- A broader targeted run reported **46 passing tests and one failing existing assertion** in `careTeamPages.test.jsx`: it searches for a button named `common.refresh`, while the rendered button is named `Refresh`. The full suite was not completed.
- The build reports existing warnings for duplicate `clinicalReason` translation keys and missing hook dependencies in `DiagnosticOrderDetails.jsx` and `PhotoStep.jsx`.

## Desktop, tablet, and Android status

- Desktop sidebar code and behavior were left intact. The mobile bar is hidden above 767 px; at the 1366 px smoke viewport the mobile bar was hidden and the dashboard KPI grid remained four columns.
- At the 834 px tablet smoke viewport the mobile bar was hidden and the KPI grid used two columns.
- **Not verified:** real Android Chrome, installed standalone PWA behavior, safe-area rendering on a physical device, authenticated workflow taps, or a full desktop dashboard regression pass. These require an Android device/emulator and authenticated test access.

## Remaining issues

- Run installation and authenticated workflow tests on Android Chrome and an installed PWA.
- Resolve the `common.refresh` versus `Refresh` assertion before treating the broader workflow test as green.
- Address the build warnings in their owning changes.
