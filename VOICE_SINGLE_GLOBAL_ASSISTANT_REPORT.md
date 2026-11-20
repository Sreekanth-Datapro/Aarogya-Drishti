# Single Global Voice Assistant — registration integration report

## Root cause

Patient Registration had a **second voice UI** (`InlineVoiceRegistration` + visible question panel) while the topbar already had **Global Voice ON/OFF**. Registration used `host: "inline"`, so the layout host was skipped and a duplicate panel owned the flow.

## What changed

- Removed the separate Voice Registration panel.
- Registration uses `host: "headless"`: Sarvam engine runs via `GlobalVoiceSession` with **no visible question chrome**.
- **Voice ON** on Patient Registration starts the workflow and fills **existing form inputs**.
- **Voice OFF** stops mic/TTS; form values stay.
- Topbar **English / తెలుగు** sets both page i18n and voice locale.
- Duplicate voice-language dropdown removed from the header control.
- Already-filled required fields are skipped (no overwrite).
- Screening still uses `VoiceWorkflowStart` + visible global session (unchanged).

## Files changed

| File | Change |
| --- | --- |
| `frontend/src/pages/PatientRegistration.jsx` | Removed inline panel; `host: "headless"`; auto-start on Voice ON |
| `frontend/src/voice/global/GlobalVoiceSession.jsx` | Hosts headless registration |
| `frontend/src/voice/VoiceReceptionist.jsx` | `variant="headless"` (engine only) |
| `frontend/src/voice/global/GlobalVoiceHeaderControl.jsx` | Voice ON/OFF + nav mic; language from page |
| `frontend/src/components/layout/Topbar.jsx` | Globe language syncs `voiceLocale` |
| `frontend/src/voice/receptionistScripts.js` | Skip filled / optional fields in auto ask |
| `frontend/src/voice/global/globalVoice.css` | Headless host styles |
| `frontend/src/voice/voice.css` | Headless / sr-only styles |

## Duplicate components removed

- `frontend/src/voice/global/InlineVoiceRegistration.jsx` (**deleted**)
- Registration “Start Voice Registration” / Question 1/12 / Stop / Retry / Type Answer panel UI

## Test results

| Check | Result |
| --- | --- |
| Frontend compile | **PASS** |
| Only one Voice ON/OFF control | **Implemented** (topbar) |
| No separate registration voice panel | **Implemented** |
| Telugu page + voice (live mic) | **NOT PERFORMED** |
| English page + voice (live mic) | **NOT PERFORMED** |
| Actual microphone end-to-end | **NOT PERFORMED** |

Live mic verification still needs a Health Worker session, mic permission, and working `SARVAM_API_KEY` on the backend.
