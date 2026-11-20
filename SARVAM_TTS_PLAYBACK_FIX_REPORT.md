# Sarvam TTS playback fix — desktop & mobile web

## Root cause (silent “Speaking…”)

**Primary bug:** `useConversationalReceptionist` registered an effect cleanup on `[speech]`.  
`useAzureSpeechRecognition` returned a **new object every render**, so React ran cleanup on nearly every update and called `cancelAzureSpeech()` **while TTS was playing**. The UI still showed Speaking…, but playback was stopped immediately — so nothing was heard.

**Secondary issues:**
- Cancelled / aborted playback was treated as success, so Listening started without successful audio.
- Playback needed AudioContext-first decode + audible GainNode routing, with HTMLAudio fallback.
- Chrome **tab mute** (speaker-with-X on the tab) can silence an otherwise healthy play path.

## Fixes

1. **Unmount-only cleanup** — cancel TTS only on true unmount (`[]` deps), never on speech-object identity churn.
2. **Stabilize** the speech hook return with `useMemo`.
3. **Treat cancelled playback as failure** — Listening does not start unless `spoken.ok === true`.
4. **Playback hardening** in `azureTtsPlayer.js`:
   - Primary: **AudioContext + AudioBufferSourceNode + GainNode(1)** after MP3 decode.
   - Fallback: **HTMLAudioElement** (`volume = 1`, `muted = false`) if AudioContext fails.
   - Reject near-silent decoded buffers.
   - Do not revoke Blob URLs before `ended` / error.
   - Temporary safe `console.info("[aarogya-tts]", …)` + `window.__aarogyaTtsQa.history` (no API key, no utterance/patient text).
5. Voice ON click still unlocks audio inside the **existing** global toggle (no new button/panel). Autoplay block message asks to click Voice ON again.

## Backend TTS probe (no key printed)

| Locale | Result | Bytes | Voice | Format |
| --- | --- | --- | --- | --- |
| en-IN | **OK** | 20480 | ishita | audio/mpeg (MPEG frame `FF F3 C0`) |
| te-IN | **OK** | 29675 | neha | audio/mpeg (MPEG frame `FF F3 C0`) |

## REAL BROWSER QA after AudioContext-first fix (2026-11-18)

Authenticated HEALTH_WORKER session on `http://localhost:3000` (CRA). Passwords not recorded here.

### Verified playback lifecycle (Cursor IDE browser)

**Telugu (`te-IN` / neha):**

- `unlock.ok` → `tts.response` (200, `audio/mpeg`) → `audiocontext.decode.ok` → `audiocontext.play.ok` → `audiocontext.ended`
- Example peak amplitude **0.91** (not silent), duration ~6.3s
- Status: **Speaking…** while playing → **Listening…** only after `audiocontext.ended`

**English (`en-IN` / ishita):**

- Same AudioContext path; peak amplitude **~0.49–0.61**
- Status: Speaking… during play; Listening… after ended

### Matrix

| Browser / device | Language | TTS API | Playback lifecycle | Physically audible (human ear) | Result |
| --- | --- | --- | --- | --- | --- |
| Desktop Chrome (Cursor IDE Chromium) | Telugu | 200 / audio/mpeg | **PASS** (`decode.ok` → `play.ok` → `ended`, peak ≫ silence) | **NOT CLAIMED** (agent cannot hear; confirm on speakers) | Technical **PASS** |
| Desktop Chrome (Cursor IDE Chromium) | English | 200 / audio/mpeg | **PASS** (ishita, AudioContext path) | **NOT CLAIMED** | Technical **PASS** |
| Desktop Chrome (system Chrome) | — | — | Tab mute was observed earlier (speaker-X) | Unmute tab, then listen | Manual |
| Desktop Edge | — | — | — | — | **NOT TESTED** |
| Android Chrome | — | — | — | — | **NOT TESTED** |
| Installed PWA | — | — | — | — | **NOT TESTED** |
| Deployed HTTPS | — | — | — | — | **NOT TESTED** |

### Honesty

- Do **not** treat HTTP 200 alone as audible success.
- Technical PASS here means decode + non-silent peak + `play.ok` + `ended` + correct Speaking→Listening.
- **Human ear confirmation on device speakers** is still required for a final PASS of “I heard the question.”
- If the Chrome tab shows a muted speaker icon, unmute the tab (right-click tab → Unmute) — the app cannot override tab mute.

## Manual verify (ear)

1. Hard-refresh Patient Registration (unregister old service workers if Voice control is missing).
2. Ensure the browser **tab is not muted** and system volume is up.
3. Voice ON → you should **hear** the question while status shows Speaking…
4. Listening should appear only after the voice finishes.
5. Repeat in English and Telugu; check Edge / Android when available.
6. DevTools console: filter `[aarogya-tts]` — look for `audiocontext.play.ok` then `audiocontext.ended` (or `html.*` fallback) with **no** unexpected `playback.cancel` mid-utterance.
