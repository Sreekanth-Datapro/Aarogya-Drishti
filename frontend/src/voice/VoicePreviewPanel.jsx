import React from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { Alert, Button } from "../components/ui";

/**
 * Shows recognized text, allows edit, and requires an explicit action to proceed.
 * Does not submit any parent form.
 */
export default function VoicePreviewPanel({
  transcript,
  interimTranscript,
  errorKey,
  privacyNote = true,
  onTranscriptChange,
  onReview,
  reviewDisabled = false,
}) {
  const { t } = useLanguage();
  const display = [transcript, interimTranscript].filter(Boolean).join(" ").trim();

  return (
    <div className="voice-preview-panel">
      {privacyNote && (
        <Alert type="info">
          <strong>{t("voice.privacyTitle")}</strong>
          {" "}
          {t("voice.privacyBody")}
        </Alert>
      )}
      {errorKey ? <Alert type="error">{t(errorKey)}</Alert> : null}

      <label className="voice-transcript-label" htmlFor="voice-transcript">
        {t("voice.transcriptLabel")}
      </label>
      <textarea
        id="voice-transcript"
        className="voice-transcript"
        rows={4}
        value={transcript}
        onChange={(event) => onTranscriptChange?.(event.target.value)}
        placeholder={t("voice.transcriptPlaceholder")}
        aria-describedby="voice-transcript-hint"
      />
      <p id="voice-transcript-hint" className="voice-transcript-hint">
        {t("voice.transcriptHint")}
      </p>
      {interimTranscript ? (
        <p className="voice-interim" aria-live="polite">
          {t("voice.interim", { text: interimTranscript })}
        </p>
      ) : null}

      <div className="voice-preview-actions">
        <Button
          type="button"
          disabled={reviewDisabled || !display}
          onClick={onReview}
        >
          {t("voice.reviewFields")}
        </Button>
      </div>
    </div>
  );
}
