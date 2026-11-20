# Voice-Based Medical Receptionist — Implementation Report

**Project:** Aarogya Drishti  
**Date:** 2026-11-18  
**Scope:** Conversational voice receptionist for Patient Registration and Patient Screening Step 3 (English / Telugu / Hindi)

---

## 1. Files created

| File | Role |
|------|------|
| `frontend/src/voice/speechSynthesis.js` | Browser TTS (`speechSynthesis` / `SpeechSynthesisUtterance`) |
| `frontend/src/voice/speechSynthesis.test.js` | TTS unit tests |
| `frontend/src/voice/receptionistLocales.js` | Locale codes (`en`/`te`/`hi` → `en-IN`/`te-IN`/`hi-IN`) + yes/no/skip/repeat |
| `frontend/src/voice/receptionistCopy.js` | All receptionist UI + question strings (en/te/hi) |
| `frontend/src/voice/fieldAnswerParsers.js` | Single-field answer parsers for registration & screening |
| `frontend/src/voice/fieldAnswerParsers.test.js` | Parser / mapping unit tests |
| `frontend/src/voice/receptionistScripts.js` | Question sequences + answer→form mappers |
| `frontend/src/voice/useConversationalReceptionist.js` | Question→speak→listen→confirm→next engine |
| `frontend/src/voice/VoiceReceptionist.jsx` | Accessible receptionist UI |
| `VOICE_RECEPTIONIST_IMPLEMENTATION_REPORT.md` | This report |

## 2. Files modified

| File | Change |
|------|--------|
| `frontend/src/voice/useSpeechRecognition.js` | One-shot mode (`continuous: false`), `onFinalResult`, stop after final |
| `frontend/src/voice/voice.css` | Receptionist layout, mic, speaking/listening animations |
| `frontend/src/voice/PRIVACY.md` | Receptionist privacy notes (no audio storage, per-answer mic) |
| `frontend/src/pages/PatientRegistration.jsx` | Wired `VoiceReceptionist` + existing API submit after final confirm |
| `frontend/src/pages/healthWorker/screening/ScreeningFormStep.jsx` | Wired `VoiceReceptionist` for Step 3 patient-reported fields |

Existing `VoiceFormAssist` (batch transcript assist) remains as a manual fallback alongside the receptionist.

---

## 3. Speech recognition

- Uses `window.SpeechRecognition` or `window.webkitSpeechRecognition` via existing `createSpeechRecognition`.
- Receptionist sessions use **one-shot** recognition (`continuous: false`), stop after a final transcript, and clear the mic between answers.
- Locale set from selected receptionist language: `en-IN`, `te-IN`, `hi-IN`.
- Errors mapped: mic denied, no-speech, network, language-not-supported, unsupported browser.
- Prevents overlapping sessions by tearing down the previous recognition instance before start.

## 4. Text-to-speech

- Uses `window.speechSynthesis` + `SpeechSynthesisUtterance`.
- Cancels previous speech before speaking; waits for `onend` before auto-starting the microphone.
- Picks a matching installed voice when available (`pickVoiceForLocale`).
- Mute control cancels speech and skips further TTS until unmuted.
- If TTS is unavailable, questions remain on screen; STT can still run when supported.

## 5. Locale configuration

| UI choice | BCP-47 (STT + TTS) |
|-----------|--------------------|
| English | `en-IN` |
| తెలుగు (Telugu) | `te-IN` |
| हिन्दी (Hindi) | `hi-IN` |

Receptionist copy is self-contained (not limited by app UI `normalizeLanguage` which is en/te only). After language selection, questions, confirmations, and validation hints use that language only.

## 6. Registration field mappings

| Receptionist field | Existing form field |
|--------------------|---------------------|
| `full_name` | `full_name` |
| `sex` | `sex` (`FEMALE`/`MALE`/`OTHER`/`UNDISCLOSED`) |
| `age_years` | `age_years` (0–120) |
| `preferred_language_id` | `preferred_language_id` |
| `mandal_id` | `mandal_id` (skipped if only one assigned mandal) |
| `village_id` | `village_id` |
| `facility_id` | `facility_id` |
| `habitation` | `habitation` (optional / skippable) |
| `address_line` | `address_line` (optional / skippable) |
| `consent_data` | `consents.DATA_PROCESSING` |
| `consent_screening` | `consents.SCREENING` |
| `consent_image` | `consents.IMAGE_CAPTURE` |

**Not asked (do not exist on form):** mobile number.  
**District:** display-only from mandal — not collected by voice.  
**Date of birth / witness / oral exam:** left to manual form where required.

## 7. Screening Step 3 field mappings

| Receptionist field | Existing screening state |
|--------------------|--------------------------|
| `chiefComplaint` | `chiefComplaint` → API `chief_complaint` |
| `symptoms` | `symptoms.<CODE>` (+ optional duration elsewhere) |
| `exposures` | `exposures.<CODE>` + `is_current` (skipped if history locked) |
| `conditions` | `conditions` (other medical history) |
| `pain` | `pain.has_pain` |
| `pain_location` | `pain.location` (only if pain = yes) |
| `pain_duration` | `pain.duration_days` (only if pain = yes) |
| `notes` | `notes` (optional) |

**Not filled by voice (remain manual):** oral observations, pain severity score, consents/witness, diagnosis/AI fields.

## 8. Existing APIs reused

| Flow | API |
|------|-----|
| Registration | `POST /patients/duplicate-check`, `POST /patients` (same payload shape as manual submit) |
| Screening create | `POST /screenings` |
| Screening requested-info | `PUT /screenings/:id/requested-information` |

No new backend endpoints. No schema changes.

## 9. Validation and confirmation behavior

1. Assistant speaks the question (selected language).
2. Waits for TTS to finish, then opens the microphone.
3. Shows recognized transcript; speaks “I heard …” and asks yes/no.
4. On **no** / correct → re-ask same field.
5. On **yes** → store answer and advance.
6. Required fields cannot be skipped; optional fields accept skip/none.
7. Invalid age/sex/yes-no → spoken hint; stay on same question.
8. Final review reads all collected details; explicit yes required before submit.
9. Never auto-submits mid-conversation.

## 10. Privacy protections

- Microphone requested only while answering (stopped after each final result).
- UI explains mic use; no continuous recording.
- No raw audio stored by the app; no audio posted to Aarogya APIs / aipipe.
- Medical transcripts are not written to `console.log`.
- Existing auth and consent workflows preserved; voice does not bypass authorization.
- Browser vendor STT processing caveat documented in `frontend/src/voice/PRIVACY.md`.

## 11. Tests executed and results

| Suite | Result |
|-------|--------|
| `fieldAnswerParsers.test.js` | **11/11 passed** |
| `speechSynthesis.test.js` | **4/4 passed** |
| `speechRecognition.test.js` | **7/7 passed** |

Commands (CI mode):

```text
CI=true npx react-scripts test --watchAll=false --testPathPattern=fieldAnswerParsers
CI=true npx react-scripts test --watchAll=false --testPathPattern=speechSynthesis
```

## 12. Production build result

**PASS** — `npx react-scripts build` completed successfully (exit 0).  
Log: `frontend/voice-build-out2.txt`. Output written to `frontend/build/`.

Note: A CI-mode build (`CI=true`) fails on **pre-existing** ESLint warnings unrelated to this feature (`translations.js` duplicate key, `DiagnosticOrderDetails.jsx` / `PhotoStep.jsx` hook deps). Those were not introduced by the receptionist work.

## 13. Features that still require real-device testing

The following were **not** claimed as verified on a physical device with microphone permission:

1. Chrome/Edge mic permission grant/deny UX on Windows.
2. Live Telugu (`te-IN`) recognition accuracy on target devices.
3. Live Hindi (`hi-IN`) recognition accuracy / language-pack availability.
4. Telugu/Hindi TTS voice quality when OS voices are missing (fallback to on-screen text).
5. End-to-end registration submit after full spoken flow with real patients.
6. End-to-end screening submit when oral observations + pain score are completed manually after voice.
7. Safari / Firefox support gaps (unsupported STT → manual form fallback).
8. Noisy clinic environment recognition reliability.

---

## Success criteria checklist

| Criterion | Status |
|-----------|--------|
| Select English / Telugu / Hindi | Implemented |
| Hear assistant in that language | Implemented (browser TTS) |
| Answer by voice | Implemented (Web Speech STT) |
| Map answers to correct fields | Implemented |
| Hear confirmation of each answer | Implemented |
| Correct mistakes | Implemented |
| Complete registration one question at a time | Implemented |
| Complete screening one question at a time | Implemented |
| Hear all collected details | Implemented |
| Confirm before submit | Implemented |
| Submit only after final confirmation | Implemented |
| Manual form fallback preserved | Yes (`VoiceFormAssist` + typed fields) |

## D1 fix (false success before API)

**Root cause:** `useConversationalReceptionist` set `phase = "done"` and `VoiceReceptionist` showed success as soon as the patient confirmed the review, before `onRequestSubmit` finished.

**Fix:** Interview confirmation now enters `ready` → `submitting`. Success UI (`phase = "success"`) only after parent returns `{ ok: true }`. Failures keep answers and expose **Retry submission**. See `submissionResult.js`.
