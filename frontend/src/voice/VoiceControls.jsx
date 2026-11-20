import React from "react";
import { Mic, MicOff, Pause, Play, Trash2 } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { Button } from "../components/ui";
import { VOICE_LOCALES } from "./speechRecognition";

/**
 * Start / Stop / Pause / Clear + speech locale selector.
 * All buttons are type="button" so they never submit a parent form.
 */
export default function VoiceControls({
  supported,
  status,
  locale,
  onLocaleChange,
  onStart,
  onStop,
  onPause,
  onResume,
  onClear,
  disabled = false,
}) {
  const { t } = useLanguage();
  const listening = status === "listening";
  const paused = status === "paused";

  if (!supported || status === "unsupported") {
    return (
      <div className="voice-controls voice-controls-unsupported" role="status">
        <MicOff size={18} aria-hidden="true" />
        <span>{t("voice.unsupported")}</span>
      </div>
    );
  }

  return (
    <div className="voice-controls" role="group" aria-label={t("voice.controlsLabel")}>
      <label className="voice-locale">
        <span className="voice-locale-label">{t("voice.localeLabel")}</span>
        <select
          className="select voice-locale-select"
          value={locale}
          disabled={disabled || listening}
          onChange={(event) => onLocaleChange?.(event.target.value)}
          aria-label={t("voice.localeLabel")}
        >
          {VOICE_LOCALES.map((item) => (
            <option key={item.code} value={item.code}>
              {t(item.labelKey)}
            </option>
          ))}
        </select>
      </label>

      <div className="voice-control-buttons">
        {!listening && !paused && (
          <Button type="button" variant="secondary" disabled={disabled} onClick={onStart}>
            <Mic size={16} aria-hidden="true" />
            {t("voice.start")}
          </Button>
        )}
        {listening && (
          <>
            <Button type="button" variant="secondary" onClick={onPause}>
              <Pause size={16} aria-hidden="true" />
              {t("voice.pause")}
            </Button>
            <Button type="button" variant="secondary" onClick={onStop}>
              <MicOff size={16} aria-hidden="true" />
              {t("voice.stop")}
            </Button>
          </>
        )}
        {paused && (
          <>
            <Button type="button" variant="secondary" onClick={onResume}>
              <Play size={16} aria-hidden="true" />
              {t("voice.resume")}
            </Button>
            <Button type="button" variant="secondary" onClick={onStop}>
              <MicOff size={16} aria-hidden="true" />
              {t("voice.stop")}
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" disabled={disabled} onClick={onClear}>
          <Trash2 size={16} aria-hidden="true" />
          {t("voice.clear")}
        </Button>
      </div>

      {listening && (
        <p className="voice-status-live" aria-live="polite">
          {t("voice.listening")}
        </p>
      )}
      {paused && (
        <p className="voice-status-live" aria-live="polite">
          {t("voice.paused")}
        </p>
      )}
    </div>
  );
}
