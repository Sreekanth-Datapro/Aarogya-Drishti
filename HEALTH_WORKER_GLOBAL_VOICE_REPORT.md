# Health Worker Global Voice — report

## Summary

The existing `GlobalVoiceProvider` already lived in `MainLayout` (survives HW navigation). Page-aware announcements and navigation intents cover authorized HEALTH_WORKER routes. Registration and screening keep their own form workflows.

One header Voice ON/OFF control. No new page voice panels. Sarvam TTS/STT and `azureTtsPlayer.js` reused.

**Browser / device used for remaining QA (18 Nov 2026):** Cursor IDE Chromium (Electron 43.8.4 / Chrome 150) on Windows 10 (`localhost:3000`), Health Worker `qa.voice.hw`, mic permission **granted** (Conexant ISST Audio).

---

## Health Worker routes discovered

| Path | Sidebar / UI | Permission |
| --- | --- | --- |
| `/dashboard` | Dashboard | Signed-in |
| `/health-worker/patient-search` | Search patients | `page.healthWorkerPatientSearch` |
| `/health-worker/patients` | Patient registration | `page.healthWorkerPatients` |
| `/health-worker/patients/:patientId` | Patient details (no separate sidebar item) | patients or search |
| `/health-worker/screening` | Screening | `page.screening` |
| `/health-worker/appointments` | My Appointments | `page.healthWorkerAppointments` |
| `/health-worker/diagnostics` (+ nested orders) | Diagnostics | `page.healthWorkerDiagnostics` |
| `/health-worker/tracking` (+ `/:patientId`) | Patient tracking | `page.healthWorkerTracking` |
| `/health-worker/followups` | Follow-up | `page.followUp` |
| `/settings` | Settings (profile) | Signed-in |
| `/video-consultations/:id/meeting` | Video meeting | Shared video perms (not HW sidebar) |

Source: `App.js` + `config/navigation.js` → `ROLE_MODULES.HEALTH_WORKER`.

---

## Voice features by route

| Route | Voice ON | Nav commands | Page announce | Form workflow |
| --- | --- | --- | --- | --- |
| Dashboard | Yes | Yes | Menu options (en/te/hi) | No |
| Patient search | Yes | Yes | Search guidance | No |
| Patient registration | Yes | Yes (when idle) | **Skipped** (workflow owns audio) | Auto-start registration Q&A |
| Patient details | Yes | Yes | Safe UI actions only (no PHI) | No |
| Screening | Yes | Yes | Wizard guidance | Explicit “Start Screening by Voice” on form step |
| Appointments | Yes | Yes | Appointments guidance | No |
| Diagnostics | Yes | Yes | Diagnostics guidance | No |
| Tracking | Yes | Yes | Tracking guidance | No |
| Follow-up | Yes | Yes | Follow-up guidance | No |
| Settings | Yes | Yes | Settings guidance | No |
| Reports | — | **Denied** for HEALTH_WORKER | N/A | No HW reports route |

---

## Files changed (implementation)

| File | Change |
| --- | --- |
| `frontend/src/voice/global/voiceNavigation.js` | HW targets: patients/search, diagnostics, tracking, followups |
| `frontend/src/voice/global/voicePageGuide.js` | **New** — page announce copy (en/te/hi), no PHI |
| `frontend/src/voice/global/GlobalVoicePageAssist.jsx` | **New** — page announce after Voice ON / nav; race-safe vs `stopEverything` |
| `frontend/src/components/MainLayout.jsx` | Mount `GlobalVoicePageAssist` |
| `frontend/src/voice/global/GlobalVoiceHeaderControl.jsx` | Speaking/Listening for page assist; richer unrecognized hint |
| `frontend/src/voice/global/GlobalVoiceContext.jsx` | Voice-command handler return value; `window.__aarogyaVoiceCommand` |
| `frontend/src/voice/global/voiceNavigation.test.js` | Expanded unit tests |

Unchanged by design: DB schema, APIs, registration/screening engines, other roles’ routes.

---

## Remaining QA matrix (this run)

### Device

| Item | Value |
| --- | --- |
| Browser | Cursor IDE Chromium / Electron 43.8.4 (Chrome 150) |
| OS | Windows 10 |
| App URL | `http://localhost:3000` |
| Role | HEALTH_WORKER |
| Microphone | Permission **granted**; device “Internal Microphone (Conexant ISST Audio)” |

### TEST 1 – Screening full voice workflow

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Open Screening via global voice command | **PASS** | `__aarogyaVoiceCommand('Open Screening')` → `/health-worker/screening` |
| Start existing Screening voice workflow | **PASS** | “Start Screening by Voice” → Oral Screening panel, Q1 of 8, Listening |
| Every supported question | **PASS** | All 8 questions asked (chief → symptoms → exposures → conditions → pain → location → duration → notes) then Final review |
| Recognized answers populate fields | **PASS** | Answers via typed-answer path (same `processAnswerTranscript` as STT): chief `xyz`, ulcer checked, Gutkha current, conditions `diabetes`, Has pain, location tongue, duration 10 |
| Invalid answers repeat same question | **PASS** | Symptoms garbage `asdfqwerty` stayed on Question 2; earlier mic-unclear also re-asked chief complaint |
| Manual oral observations editable | **PASS** | Tongue observation textarea filled manually after voice |
| Manual pain score editable | **PASS** | Range input set to 5/10 after voice set `has_pain` |
| Final review | **PASS** | Final review listed all captured answers; Confirm/typed “yes” |
| API / submit failure handling | **PASS** | Submit without pain score → “Enter a pain score from 0 to 10… answers still saved… retry” |
| API success | **PASS** | After score + observation, retry advanced wizard to **Oral photos** step |
| Network/5xx failure | **NOT TESTED** | No forced server outage; validation failure + success path covered |

**TEST 1 overall: PASS** (network/5xx specifically NOT TESTED).

### TEST 2 – Live microphone STT

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Microphone permission | **PASS** | `navigator.permissions` → `granted`; `getUserMedia({audio:true})` OK |
| Mic starts when Listening | **PASS** | Screening Q1 and header Voice command showed Listening… / `.is-listening` |
| Mic stops after answer | **PASS** | After typed answer accept, Listening ended and workflow advanced (capture aborted via `speech.stop()`) |
| Duplicate recognition does not double-submit | **PASS** (code + behaviour) | `lastProcessedRef` token in `useConversationalReceptionist`; single advance observed per answer |
| English spoken → correct text | **NOT TESTED** | No human speech into mic; speaker→mic loopback did not produce a transcript / navigation |
| Telugu spoken → correct text | **NOT TESTED** | Same blocker — cannot claim live language STT without spoken audio capture |

**Blocker:** Automated IDE browser cannot inject real spoken audio into the MediaStream STT pipeline. Loopback via `speechSynthesis` did not yield a recognized transcript.

**TEST 2 overall: PARTIAL** — permission/start/stop/dedupe PASS; live EN/TE speech recognition **NOT TESTED**.

### TEST 3 – Cross-page stability

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Dashboard → Registration → Screening → Appointments → Patients | **PASS** | Voice commands navigated each authorized path; Voice ON remained pressed |
| Global voice control available | **PASS** | Header Voice ON + Voice command present on each page |
| One active voice session / no duplicate listeners | **PASS** | During nav, `listeningCount` 0 and no concurrent receptionist question; header mic disabled while `sessionActive` |
| Previous page questions do not continue | **PASS** | After leaving Screening photos / Registration, no leftover registration/screening question panel on later pages |
| Voice OFF stops speech and listening | **PASS** | Toggle → Voice OFF; status cleared; `playback.cancel` in TTS QA |

**TEST 3 overall: PASS.**

### TEST 4 – Security

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Voice “Open Reports” denied | **PASS** | `{ ok:false, code:'denied', id:'reports' }`; stayed on current authorized page |
| Direct `/admin/reports` | **PASS** | UI: “You do not have access to this page” |
| Direct `/medical-officer/reports` | **PASS** | Same access-denied UI |
| No sensitive patient details spoken automatically | **PASS** | `voicePageGuide.js` announces UI options only (no names/codes). Dashboard may *list* patients in normal UI (not spoken by page assist). Screening voice did not auto-speak PHI |

**TEST 4 overall: PASS.**

---

## Earlier navigation QA (still valid)

| Test | Result |
| --- | --- |
| Unit `voiceNavigation.test.js` (10) | **PASS** |
| Voice ON dashboard announce | **PASS** |
| Voice nav: Screening / Appointments / Patients / Tracking / Follow-up / Registration / Dashboard | **PASS** |
| Telugu dashboard announce | **PASS** (prior run) |
| Diagnostics announce | **PASS** (prior run) |

---

## Routes / items still not fully exercised

| Item | Status | Reason |
| --- | --- | --- |
| Live EN/TE spoken STT ear QA | **NOT TESTED** | No real spoken mic capture in automation |
| Network/5xx screening submit | **NOT TESTED** | Did not force backend failure |
| `/health-worker/patients/:id` voice announce | **NOT TESTED** | Guide exists; patient details page not opened this run |
| Nested diagnostics/tracking detail | **NOT TESTED** | Parent list guide covers announce |
| Edge / Android / PWA | **NOT TESTED** | Only IDE Chromium |
| Human-ear TTS confirmation | **NOT CLAIMED** | Playback path exercised; ear QA not recorded |

---

## Architecture notes

- Provider is global in `MainLayout` — does not remount between HW pages.
- Route change calls `stopEverything()` (mic / form session / TTS) but **keeps** `voiceEnabled`.
- Page assist schedules announce after nav; stop handlers only invalidate announces that already started playing.
- Registration still auto-starts on Voice ON; screening requires explicit “Start Screening by Voice”.
- App STT is Sarvam MediaStream WAV → `/api/speech/recognize` (not browser `SpeechRecognition` for capture). Header and form engines do not listen at the same time (`sessionActive` disables nav mic).
