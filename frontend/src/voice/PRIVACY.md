# Voice receptionist privacy (Sarvam AI Speech)

Aarogya Drishti’s conversational **voice receptionist** uses **Sarvam AI Speech**
for speech-to-text (STT) and text-to-speech (TTS) in English (`en-IN`), Telugu
(`te-IN`), and Hindi (`hi-IN`).

## Key handling

Audio and text are sent to the **Aarogya Drishti backend**, which calls Sarvam
using a **server-side** `SARVAM_API_KEY`. The browser never receives the API key.
Do **not** put `SARVAM_API_KEY` in any `REACT_APP_*` variable or frontend bundle.

## What is sent

1. User speaks an answer → browser records a short audio clip.
2. Clip is POSTed to `/api/speech/recognize` (authenticated Health Worker session).
3. Backend proxies to Sarvam STT (`saaras:v4`) and returns recognized text only.
4. Prompts are POSTed to `/api/speech/synthesize`; backend proxies to Sarvam TTS
   (`bulbul:v3`) and returns audio bytes.

Transcripts and audio are **not** stored by the app for the receptionist path.
Do not log the API key, raw audio, or full transcripts in production logs.

## Manual fallback

If speech is unavailable (key missing, mic denied, network error), the same
registration and screening forms remain usable via typing and normal UI.
