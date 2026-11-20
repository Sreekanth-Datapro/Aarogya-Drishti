# Voice audio playback — diagnosis & fix

## Exact failure reason (this environment)

**Azure Speech is not configured on the backend.**

```json
{ "configured": false, "hasRegion": false, "regionLen": 0, "keyLen": 0 }
```

So:

| Check | Result |
|-------|--------|
| Header Voice ON | UI-only flag — **does not** call Azure |
| `GET /api/speech/status` | `configured: false` |
| `POST /api/speech/synthesize` | Would return **503 `SPEECH_NOT_CONFIGURED`** |
| Valid audio blob | **Not produced** |
| `audio.play()` | Never reached with real MP3 |

**To hear audio**, add (with your approval — not applied here):

```env
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=centralindia
```

Then restart the backend.

---

## Code bugs fixed (would block audio even after keys are set)

1. **Status race** — session spoke before `/speech/status` finished → treated as not configured. Now `speak()` awaits `ensureSpeechStatus()`.
2. **Workflow re-register ended the session** — form updates cleared `sessionActive` and cancelled TTS. Cleanup no longer stops an active session.
3. **Session restart on every workflow object change** — now starts once per `sessionNonce` only.
4. **Browser autoplay** — `unlockAzureAudio()` on Voice ON and Start click; `audio.play()` rejections show visible messages (`ttsAutoplayBlocked`).
5. **Playback hygiene** — volume `1`, not muted; generation token so cancel doesn’t race; empty/JSON blobs rejected with clear errors.
6. **Header language sync** — Start uses `voiceLocale` from the header (te → Shruti, hi → Swara, en → Neerja).
7. **Visible Azure-missing hint** — header status + receptionist `ttsNotConfigured` message.

---

## Expected path after keys are added

1. User turns **Voice ON** (unlocks audio) and picks language.  
2. User clicks **Start Patient Registration by Voice**.  
3. `POST /api/speech/synthesize` with locale `te-IN` / `hi-IN` / `en-IN`.  
4. Response `audio/mpeg` + header `X-Speech-Voice: te-IN-ShrutiNeural` (etc.).  
5. Frontend `Audio` plays blob; first question is spoken.

---

## Browser test this pass

| Item | Verdict |
|------|---------|
| Configured flag | **FAIL / root cause** — keys absent |
| Live synthesize + hear voice | **NOT VERIFIED** until keys exist |
| Login auto-speak | Still disabled (no MainLayout voice) |

Live PASS for hearing audio requires Azure credentials in `backend/.env` and a Health Worker session.
