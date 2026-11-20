import React, { useCallback, useEffect } from "react";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { normalizeReceptionistLocale, receptionistBcp47 } from "../receptionistLocales";
import useAzureSpeechRecognition from "../useAzureSpeechRecognition";
import { unlockAzureAudio } from "../azureTtsPlayer";
import { useGlobalVoiceOptional } from "./GlobalVoiceContext";
import "./globalVoice.css";

/**
 * Compact header control: Voice ON/OFF + nav mic.
 * Page language (Topbar Globe) drives voice locale for en/te.
 */
export default function GlobalVoiceHeaderControl() {
  const voice = useGlobalVoiceOptional();
  const { language } = useLanguage();

  const voiceEnabled = Boolean(voice?.voiceEnabled);
  const sessionActive = Boolean(voice?.sessionActive);
  const navListening = Boolean(voice?.navListening);
  const navStatus = voice?.navStatus || "";
  const playbackPhase = voice?.playbackPhase || "idle";
  const ttsHint = voice?.ttsHint || "";

  useEffect(() => {
    if (!voice?.setVoiceLocale) return;
    const page = normalizeReceptionistLocale(language);
    if (voice.voiceLocale === "hi") return;
    if (voice.voiceLocale !== page) {
      voice.setVoiceLocale(page);
    }
  }, [language, voice]);

  const bcp47 = receptionistBcp47(voice?.voiceLocale || language);

  const speech = useAzureSpeechRecognition({
    lang: bcp47,
    enabled: Boolean(voice) && voiceEnabled && !sessionActive,
  });

  useEffect(() => {
    if (!voice?.registerStopHandler) return undefined;
    return voice.registerStopHandler(() => {
      speech.abort?.();
      voice.setNavListening?.(false);
    });
  }, [voice, speech]);

  useEffect(() => {
    if (!voice || !navListening) return;
    if (speech.status !== "idle") return;
    const text = (speech.transcript || "").trim();
    if (!text) {
      if (speech.errorKey) {
        voice.setNavStatus?.(speech.errorKey === "voice.micDenied" ? "micDenied" : "noSpeech");
        voice.setNavListening?.(false);
      }
      return;
    }
    voice.setNavListening?.(false);
    voice.handleNavigationTranscript?.(text);
    speech.clear();
  }, [voice, navListening, speech]);

  const onMicClick = useCallback(() => {
    if (!voice) return;
    if (!voice.voiceEnabled) {
      voice.setVoiceEnabled(true);
      return;
    }
    if (voice.sessionActive) {
      voice.setNavStatus("sessionActive");
      return;
    }
    if (voice.navListening || speech.status === "listening") {
      speech.abort?.();
      voice.setNavListening(false);
      voice.setNavStatus("");
      return;
    }
    speech.clear();
    voice.setNavStatus("listening");
    voice.setNavListening(true);
    speech.start();
  }, [voice, speech]);

  if (!voice) return null;

  let statusText = "";
  if (ttsHint) statusText = ttsHint;
  else if (!voiceEnabled) statusText = "";
  else if (playbackPhase === "speaking") statusText = "Speaking…";
  else if (navStatus === "listening" || navListening || speech.status === "listening") statusText = "Listening…";
  else if (sessionActive && playbackPhase === "listening") statusText = "Listening…";
  else if (sessionActive) statusText = "Voice active";
  else if (navStatus === "denied") statusText = "Not allowed for your role";
  else if (navStatus === "unrecognized") {
    statusText = "Say: Open Dashboard / Registration / Screening / Read this page again";
  }
  else if (navStatus === "reread") statusText = "Reading page…";
  else if (navStatus === "navigating") statusText = "Opening…";
  else if (navStatus === "micDenied") statusText = "Microphone blocked";
  else if (navStatus === "noSpeech") statusText = "No speech heard";
  else if (navStatus === "sessionActive") statusText = "Finish or stop form voice first";
  else if (voice.speechConfigured === false) statusText = "Sarvam Speech not configured";

  return (
    <div className="global-voice-header" aria-label="Voice receptionist">
      <button
        type="button"
        className={`global-voice-toggle ${voiceEnabled ? "is-on" : ""}`}
        aria-pressed={voiceEnabled}
        title={voiceEnabled ? "Voice ON" : "Voice OFF"}
        onClick={async () => {
          if (voiceEnabled) {
            // If TTS was blocked, Voice ON click re-unlocks and retries the question.
            if (ttsHint) {
              // Unlock starts synchronously inside this click (autoplay gesture).
              const unlocked = await unlockAzureAudio();
              if (!unlocked) {
                voice.setTtsHint?.("Click Voice ON again to enable audio playback.");
                return;
              }
              await voice.retryPlayback?.();
              return;
            }
            voice.stopEverything();
            voice.setVoiceEnabled(false);
            return;
          }

          // Unlock MUST start inside this existing Voice ON click (autoplay gesture)
          // before enabling the workflow so TTS play is allowed.
          const unlocked = await unlockAzureAudio();
          voice.setVoiceLocale(normalizeReceptionistLocale(language));
          voice.setVoiceEnabled(true);
          if (!unlocked) {
            voice.setTtsHint?.("Click Voice ON again to enable audio playback.");
          } else {
            voice.setTtsHint?.("");
          }
        }}
      >
        {voiceEnabled ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
        <span className="global-voice-toggle-label">{voiceEnabled ? "Voice ON" : "Voice OFF"}</span>
      </button>

      <button
        type="button"
        className={`icon-action-btn global-voice-mic ${(navListening || speech.status === "listening") ? "is-listening" : ""}`}
        aria-label={navListening ? "Stop listening" : "Voice command"}
        disabled={!voiceEnabled}
        onClick={onMicClick}
      >
        {navListening || speech.status === "listening"
          ? <MicOff size={18} aria-hidden="true" />
          : <Mic size={18} aria-hidden="true" />}
      </button>

      {statusText ? (
        <span
          className={`global-voice-status ${ttsHint ? "is-warning" : ""}`}
          role="status"
          title={statusText}
        >
          {statusText}
        </span>
      ) : null}
    </div>
  );
}
