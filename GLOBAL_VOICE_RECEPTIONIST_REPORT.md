# Global Voice Receptionist — implementation report

## Goal

One global Voice Receptionist in the app header. Removed duplicate page panels
(**Voice Receptionist** + **Voice Assist**) from Patient Registration and Screening.

## Files changed

| File | Change |
|------|--------|
| `frontend/src/voice/global/GlobalVoiceContext.jsx` | Page-aware controller (locale, ON/OFF, session, route stop) |
| `frontend/src/voice/global/GlobalVoiceHeaderControl.jsx` | Header mic + Voice ON/OFF + en/te/hi |
| `frontend/src/voice/global/GlobalVoiceSession.jsx` | Single host for active form workflow |
| `frontend/src/voice/global/VoiceWorkflowStart.jsx` | Small page CTA (explicit start only) |
| `frontend/src/voice/global/useRegisterVoiceWorkflow.js` | Page registers questions/handlers |
| `frontend/src/voice/global/voiceNavigation.js` | en/te/hi nav intents + role checks |
| `frontend/src/voice/global/globalVoice.css` | Header/session styles |
| `frontend/src/voice/VoiceReceptionist.jsx` | `variant="global"`, ref start/stop, no rewrite of engine |
| `frontend/src/components/MainLayout.jsx` | Provider + session host |
| `frontend/src/components/layout/Topbar.jsx` | Header voice control |
| `frontend/src/pages/PatientRegistration.jsx` | Removed panels; CTA + workflow register |
| `frontend/src/pages/healthWorker/screening/ScreeningFormStep.jsx` | Same for screening |

## Components removed from pages (not deleted from repo)

- **VoiceFormAssist** usage removed from Registration + Screening (Voice Assist panels gone).
- **VoiceReceptionist** page embeds removed; reused only via `GlobalVoiceSession`.

## Components reused

- `useConversationalReceptionist` (unchanged engine)
- `receptionistScripts` / Azure speech client / TTS player
- Existing React Router routes + role gates

## Behaviour

- Login / MFA: no header voice (outside `MainLayout`) → no auto mic/TTS.
- Header: Voice ON/OFF, language (English India / తెలుగు / हिन्दी), mic for navigation.
- Registration / Screening: small “Start … by Voice” only; starts on click.
- Route change: stops mic + cancels audio; does not auto-speak on next page.
- Navigation commands respect role; unauthorized → denied status.

## Tests

| Test | Result |
|------|--------|
| `voiceNavigation.test.js` | To run |
| Live login auto-speak / mic | **NOT VERIFIED** in browser this pass |
| Live registration/screening Azure STT/TTS | **NOT VERIFIED** (needs keys + HW login + mic) |
| Live route-change stop | **NOT VERIFIED** |

Code structure satisfies the requirements; do not treat live speech as PASS without Chrome/HW testing.
