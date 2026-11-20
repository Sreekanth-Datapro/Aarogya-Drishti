# Azure Speech multilingual voice — implementation report

## Summary

The Voice Receptionist now uses **Microsoft Azure AI Speech** for STT and TTS
(`en-IN`, `te-IN`, `hi-IN`) via **authenticated backend proxies**. Azure keys
stay on the server. The conversational flow (auto-fill, no per-field yes/no,
final review, submit retry, manual form) is preserved.

**`backend/.env` was not modified** (per approval rule). Add keys yourself:

```env
AZURE_SPEECH_KEY=<your-key>
AZURE_SPEECH_REGION=centralindia
```

(Documented in `backend/.env.example`.) Restart the backend after adding them.

---

## Architecture

| Layer | Role |
|-------|------|
| Frontend | Language selector → locked `en-IN` / `te-IN` / `hi-IN`; mic PCM→WAV; play TTS audio |
| `POST /api/speech/synthesize` | SSML TTS with neural voice (HEALTH_WORKER auth) |
| `POST /api/speech/recognize` | Short audio STT with locked `language=` query (HEALTH_WORKER auth) |
| `GET /api/speech/status` | Configured flag + voice verification (no key exposed) |

### Voices (locked)

| Locale | Voice |
|--------|-------|
| `te-IN` | `te-IN-ShrutiNeural` |
| `hi-IN` | `hi-IN-SwaraNeural` |
| `en-IN` | `en-IN-NeerjaNeural` |

Telugu requests never remap to English. STT rejects a mismatched locale in the response.

---

## Key files

**Backend**

- `backend/services/azureSpeechService.js`
- `backend/controllers/speechController.js`
- `backend/routes/speech.js` → mounted at `/api/speech`
- `backend/config/config.js` — `azureSpeech` config block
- `backend/.env.example` — key names only

**Frontend**

- `frontend/src/voice/azureSpeechConfig.js`
- `frontend/src/voice/azureSpeechClient.js`
- `frontend/src/voice/azureTtsPlayer.js`
- `frontend/src/voice/useAzureSpeechRecognition.js`
- `frontend/src/voice/wavEncoder.js`
- `frontend/src/voice/useConversationalReceptionist.js` — Azure STT/TTS wiring
- `frontend/src/voice/VoiceReceptionist.jsx` — typed-answer fallback
- `frontend/src/voice/PRIVACY.md` — updated

Web Speech helpers remain for **Voice Form Assist** only; receptionist no longer depends on browser `SpeechRecognition` / `speechSynthesis`.

---

## Behaviour checklist (code)

| Requirement | Status |
|-------------|--------|
| Azure STT + TTS | Implemented (backend proxy) |
| Keys only on backend | Implemented |
| Language selector controls STT + TTS | Implemented (`bcp47` → both) |
| Telugu does not silently become English | Implemented (locale lock + mismatch guard) |
| STT fail → same question / retry / type | Implemented |
| TTS fail → show text + manual/typed input | Implemented |
| Auto-fill, edit field, final review, submit retry | Preserved |
| Auth / HEALTH_WORKER only for speech APIs | Implemented |
| Stop mic + audio on leave | Implemented (`abort` + `cancelAzureSpeech`) |
| No raw audio save / no transcript logging | Implemented |
| DB schema unchanged | Yes |

---

## Code tests vs live tests

### A. Code / unit tests

| Suite | Result |
|-------|--------|
| `backend/tests/unit/azureSpeechService.test.js` | **PASS** (6/6) — locale lock, SSML voices, STT `language=te-IN`, voice verification |
| `frontend/.../azureSpeechConfig.test.js` | **PASS** (3/3) |
| `frontend/.../wavEncoder.test.js` | **PASS** after float fix (run locally) |
| Conversation / submission flow tests | Unchanged; still applicable |

Voice verification against a **live** Azure region runs only when `AZURE_SPEECH_*` is set (`GET /api/speech/status` → `voicesVerified`).

### B. Live browser tests

| Test | Verdict |
|------|---------|
| Telugu STT + TTS | **NOT VERIFIED** — needs Azure keys + HW login + mic |
| Hindi STT + TTS | **NOT VERIFIED** |
| English STT + TTS | **NOT VERIFIED** |
| Invalid speech retry | **NOT VERIFIED** (logic present; no mic session) |
| Mic permission denied | **NOT VERIFIED** |
| Network / API failure + retry | **NOT VERIFIED** |
| Android Chrome PWA | **NOT VERIFIED** |
| Windows Chrome Desktop | **NOT VERIFIED** |

No microphone session was performed in this implementation pass. Do not treat live multilingual speech as PASS until keys are configured and tested on Chrome Desktop / Android PWA.

---

## How to finish live verification

1. Add `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` to `backend/.env` (approval to edit values).
2. Restart backend; open `GET /api/speech/status` as Health Worker — expect `configured: true` and `voicesVerified: true`.
3. Sign in as HEALTH_WORKER → Patients → start receptionist in తెలుగు / हिन्दी / English.
4. Confirm spoken questions use neural voices; spoken answers fill fields without yes/no.
5. Deny mic → typed answer / manual form still work.
6. Offline or bad key → TTS/STT errors show on-screen text; submit retry still works after interview.
