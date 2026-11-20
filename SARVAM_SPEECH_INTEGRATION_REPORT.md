# Sarvam AI Speech — integration report

## Verdict

The Voice Receptionist active speech path now uses **Sarvam AI** (STT + TTS)
via authenticated backend proxies. Azure Speech is removed from the runtime
path. `SARVAM_API_KEY` is read only from `backend/.env` (not auto-edited).

## Required changes (from Azure inspection)

| Area | Azure (previous) | Sarvam (current) |
| --- | --- | --- |
| Env | `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` | `SARVAM_API_KEY` |
| Auth header | `Ocp-Apim-Subscription-Key` | `api-subscription-key` |
| STT | Azure REST conversation STT | `saaras:v4` → `https://api.sarvam.ai/speech-to-text` |
| TTS | Neural voices + SSML | `bulbul:v3` → `https://api.sarvam.ai/text-to-speech` |
| Voices | te-IN-ShrutiNeural / hi-IN-SwaraNeural / en-IN-NeerjaNeural | te→`neha`, hi→`priya`, en→`ishita` |
| Response | Raw audio bytes | Base64 `audios[]` → MP3 buffer |

Preserved: `/api/speech/{status,synthesize,recognize}` contracts, conversational
receptionist phases, registration/screening workflows, retry / typing /
mic-denied handling, locale lock (`te-IN` never remaps to English), schema and
non-speech APIs.

## Implementation

### Backend
- Added `backend/services/sarvamSpeechService.js`
- `backend/controllers/speechController.js` → Sarvam only
- `backend/config/config.js` → `sarvamSpeech.apiKey`
- `backend/.env.example` documents `SARVAM_API_KEY` (commented)
- Removed `backend/services/azureSpeechService.js` (unused)

### Frontend
- Speech client/player/config still file-named `azure*` for import stability,
  but call Sarvam-backed `/api/speech/*` and Bulbul speakers
- Copy / header status / PRIVACY updated to Sarvam
- API key never referenced in frontend env (`REACT_APP_*`)

### Security
- Key used only server-side
- `/api/speech/status` returns `configured` / models / locales — never the key
- Unit tests and this report do not print secret values

## Tests

| Suite | Result |
| --- | --- |
| `backend/tests/unit/sarvamSpeechService.test.js` | **PASS** (7/7) |
| `frontend/src/voice/azureSpeechConfig.test.js` | **PASS** (3/3) |
| Supertest `GET /api/speech/status` (no token) | **401** `TOKEN_REQUIRED` (route mounted; no key in body) |
| Live Sarvam STT/TTS with real audio | **NOT VERIFIED** — `SARVAM_API_KEY` missing from `backend/.env` |

Config probe (no secret):
`configured=false`, `provider=sarvam`, STT `saaras:v4`, TTS `bulbul:v3`,
locales `en-IN` / `te-IN` / `hi-IN`, speakers `ishita` / `neha` / `priya`.

## Enable live voice

Manually add to `backend/.env` (do not commit):

```
SARVAM_API_KEY=<your-sarvam-key>
```

Restart the backend, sign in as a Health Worker, turn Voice ON, start a
registration or screening workflow, and confirm Telugu / Hindi / English
playback + recognition.
