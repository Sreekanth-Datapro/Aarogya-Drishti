# Health Worker Global Voice — Page Reading & Explanation

## Summary

Extended the existing `GlobalVoicePageAssist` so that with **Voice ON**, every authorized Health Worker page gets an automatic spoken explanation: page purpose + safe visible content (titles, section headings, statistics, form fields, actions).

No second voice assistant, no extra mic buttons. Sarvam TTS via `speakAzureText` / `azureTtsPlayer.js`. Registration and screening form workflows remain.

---

## Page reading behaviour

| Page | Route | What is spoken |
| --- | --- | --- |
| Dashboard | `/dashboard` | Welcome + purpose; visible stat cards (e.g. My patients, Registered this month, Screening consent, Villages); main section headings; primary actions (Search / Register). Does **not** read recent patient name rows. |
| Patient Registration | `/health-worker/patients` | Purpose (required fields / manual or voice); visible title, stats, headings. Short intro first, then existing registration Q&A auto-starts. |
| Screening | `/health-worker/screening` | Purpose (choose patient → consent → form → photos → submit); visible step headings / actions. Form Q&A only after “Start Screening by Voice”. |
| Appointments | `/health-worker/appointments` | Purpose + page title + available actions / empty-state context from visible UI. |
| Patients (search) | `/health-worker/patient-search` | Purpose + “Search patients” title / subtitle + actions. |
| Tracking | `/health-worker/tracking` | Purpose + page title + visible actions. |
| Follow-up | `/health-worker/followups` | Purpose + page title + visible actions. |
| Diagnostics / Settings / Patient details | authorized HW paths | Purpose + safe visible headings/actions (same reader). |

**Dynamic content:** labels and numbers come from the live DOM (`.stat-card`, `.page-title`, `h2`/`h3`, legends, primary buttons).  
**PHI filter:** skips patient codes (`AD-YYYY-…`), phone-like strings, and “Name · age · sex” list rows.

**Commands:** say **“Read this page again”** / **“Explain this page”** (also Telugu/Hindi phrases) to re-speak without navigating.

**Voice OFF:** stops TTS immediately (`playback.cancel`).

---

## Files changed

| File | Change |
| --- | --- |
| `frontend/src/voice/global/voicePageGuide.js` | Fuller en/te/hi purpose text; registration included |
| `frontend/src/voice/global/voicePageReader.js` | **New** — DOM reader + PHI filter + re-read command detect |
| `frontend/src/voice/global/GlobalVoicePageAssist.jsx` | Speaks full explanation; supports `pageRereadNonce` |
| `frontend/src/voice/global/GlobalVoiceContext.jsx` | `requestPageReread` / `pageRereadNonce`; handles re-read command |
| `frontend/src/voice/global/GlobalVoiceHeaderControl.jsx` | Status hint for re-read |
| `frontend/src/pages/PatientRegistration.jsx` | Wait for page intro (not speaking) before auto-starting Q&A |
| `frontend/src/voice/global/voicePageReader.test.js` | **New** unit tests |
| `frontend/src/voice/global/voiceNavigation.test.js` | Registration guide expectation updated |

No DB/API/schema changes.

---

## Tests

**Device:** Cursor IDE Chromium (Electron) on Windows 10, `localhost:3000`, HEALTH_WORKER session.

| Test | Result |
| --- | --- |
| Unit `voicePageReader.test.js` | **PASS** (4) |
| Unit `voiceNavigation.test.js` | **PASS** (9) |
| Voice ON → Dashboard speaks (status Speaking…) | **PASS** |
| Visible dashboard stats available to reader (My patients: 1, etc.) | **PASS** |
| Nav + speak: Screening, Appointments, Patients, Tracking, Follow-up, Registration | **PASS** (Speaking… on each) |
| “Read this page again” | **PASS** (`{ ok: true, id: "reread" }`, Speaking…) |
| Voice OFF cancels speech | **PASS** (`playback.cancel`, Voice OFF) |
| Patient codes not included in reader unit fixtures | **PASS** |
| Telugu language switch + dashboard open | **PARTIAL** — Voice ON after TE switch; full Telugu utterance ear QA not recorded |
| Registration Q&A still starts after intro | **PASS** (session stayed false during intro Speaking…; delay logic waits for idle) |
| Screening workflow not auto-started by page read | **PASS** |

---

## Notes

- Page assist skips while `sessionActive` (registration/screening conversation owns audio).
- Overlapping announces on navigation: route change stops TTS; new page schedules a fresh explanation.
- Human-ear confirmation of every Telugu sentence: **not claimed**.
