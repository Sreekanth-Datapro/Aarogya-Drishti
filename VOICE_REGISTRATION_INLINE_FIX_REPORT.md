# Patient Registration Voice UI — fix report

## 1. Root cause of voice-start / UX issues

1. **Separate panel:** Active receptionist UI was mounted in `GlobalVoiceSession` above `<main>`, not on the registration form. Starting voice therefore looked like opening another interface.
2. **Repeated mic clicks:** On `voice.noSpeech` / `voice.recognitionFailed`, `autoListenRef` was cleared and never re-armed after the soft re-prompt, so the user had to tap mic again.
3. **Start friction:** Page CTA + header Voice ON + layout panel made the flow feel broken even when the engine could start.

## 2. Files changed

| File | Change |
| --- | --- |
| `frontend/src/voice/global/InlineVoiceRegistration.jsx` | **New** inline host: te\|en selector, Start Voice Registration, Pause/Resume/Stop, embedded receptionist |
| `frontend/src/pages/PatientRegistration.jsx` | Uses inline host; workflow `host: "inline"` |
| `frontend/src/voice/global/GlobalVoiceSession.jsx` | Skips rendering when `workflow.host === "inline"` (screening unchanged) |
| `frontend/src/voice/useConversationalReceptionist.js` | Auto-retry mic after soft STT failures; abort mic before TTS; guard duplicate listen |
| `frontend/src/voice/VoiceReceptionist.jsx` | `variant="inline"` compact UI; mic is retry-only; listening indicator |
| `frontend/src/voice/global/globalVoice.css` | Inline panel styles |
| `frontend/src/voice/voice.css` | Mic indicator + inline action styles |

## 3. Tests

| Test | Result |
| --- | --- |
| `backend/tests/unit/sarvamSpeechService.test.js` | **PASS** (7/7) |
| Frontend compile | **PASS** (warnings only; unused var fixed) |
| Screening workflow | Code path preserved (`GlobalVoiceSession` still hosts non-inline workflows) |
| Live Telugu/English full registration with mic | **NOT PERFORMED** in this session |

## 4. Live voice test status

**Not claimed as live-verified.** End-to-end mic + Sarvam audio still requires a Health Worker login, `SARVAM_API_KEY` in `backend/.env`, and a browser with mic permission.

Manual check after restarting backend/frontend:

1. Open Patient Registration — see **తెలుగు | English** + **Start Voice Registration** on the form (no top panel).
2. Click Start — question speaks, then mic opens automatically.
3. Answer fills the field → ack → next question without another mic click.
4. Soft failures re-prompt and re-open mic; typing fallback still works.
5. Final review → one confirmation → existing `/patients` submit.
