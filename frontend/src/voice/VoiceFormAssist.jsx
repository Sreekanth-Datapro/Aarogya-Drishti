import React, { useMemo, useState } from "react";
import { Mic } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { Alert, Button, Modal } from "../components/ui";
import VoiceControls from "./VoiceControls";
import VoicePreviewPanel from "./VoicePreviewPanel";
import useSpeechRecognition from "./useSpeechRecognition";
import { preferredVoiceLocale } from "./speechRecognition";
import { classifyPatches, resolvePatches } from "./applyPatches";
import "./voice.css";

/**
 * Shared voice assist shell: recognize → edit transcript → review → confirm apply.
 * Never submits the parent form.
 */
export default function VoiceFormAssist({
  form,
  parseTranscript,
  parseContext,
  onApply,
  disabled = false,
}) {
  const { t, language } = useLanguage();
  const [locale, setLocale] = useState(() => preferredVoiceLocale(language));
  const speech = useSpeechRecognition({ lang: locale });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [proposal, setProposal] = useState({ patches: [], unclear: [], applicable: [], conflicts: [] });
  const [conflictChoices, setConflictChoices] = useState({});
  const [info, setInfo] = useState("");

  const classified = useMemo(
    () => classifyPatches(form, proposal.patches),
    [form, proposal.patches],
  );

  const openReview = () => {
    speech.stop();
    const parsed = parseTranscript(speech.transcript, parseContext) || { patches: [], unclear: [] };
    const next = classifyPatches(form, parsed.patches);
    setProposal({
      patches: parsed.patches || [],
      unclear: parsed.unclear || [],
      applicable: next.applicable,
      conflicts: next.conflicts,
    });
    setConflictChoices({});
    setReviewOpen(true);
    setInfo("");
  };

  const closeReview = () => {
    setReviewOpen(false);
  };

  const confirmApply = () => {
    const { updates, filledFields } = resolvePatches({
      applicable: classified.applicable,
      conflicts: classified.conflicts,
      choices: conflictChoices,
    });
    if (Object.keys(updates).length) {
      onApply?.(updates, filledFields);
      setInfo(t("voice.applied"));
    }
    setReviewOpen(false);
  };

  const hasAnything = classified.applicable.length > 0 || classified.conflicts.length > 0;

  return (
    <section className="voice-form-assist" aria-label={t("voice.title")}>
      <div className="voice-form-assist-heading">
        <h3><Mic size={16} aria-hidden="true" /> {t("voice.title")}</h3>
        <p>{t("voice.description")}</p>
      </div>

      <VoiceControls
        supported={speech.supported}
        status={speech.supported ? speech.status : "unsupported"}
        locale={locale}
        onLocaleChange={(next) => {
          speech.stop();
          setLocale(next);
        }}
        onStart={speech.start}
        onStop={speech.stop}
        onPause={speech.pause}
        onResume={speech.resume}
        onClear={() => {
          speech.clear();
          setInfo("");
        }}
        disabled={disabled}
      />

      <VoicePreviewPanel
        transcript={speech.transcript}
        interimTranscript={speech.interimTranscript}
        errorKey={speech.errorKey}
        onTranscriptChange={speech.setTranscript}
        onReview={openReview}
        reviewDisabled={disabled || !speech.transcript.trim()}
      />

      {info ? <Alert type="success">{info}</Alert> : null}

      <Modal
        open={reviewOpen}
        title={t("voice.confirmTitle")}
        onClose={closeReview}
        className="voice-confirm-modal"
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={closeReview}>
              {t("voice.cancelApply")}
            </Button>
            <Button type="button" disabled={!hasAnything} onClick={confirmApply}>
              {t("voice.applyConfirmed")}
            </Button>
          </>
        )}
      >
        <p>{t("voice.confirmIntro")}</p>

        {!hasAnything && proposal.unclear.length === 0 ? (
          <Alert type="warning">{t("voice.noPatches")}</Alert>
        ) : null}

        {classified.applicable.length > 0 && (
          <ul className="voice-confirm-list">
            {classified.applicable.map((patch) => (
              <li key={patch.field}>
                <strong>{t(patch.labelKey || patch.field)}</strong>
                {": "}
                {patch.displayValue ?? String(patch.value)}
              </li>
            ))}
          </ul>
        )}

        {classified.conflicts.length > 0 && (
          <div>
            <h4>{t("voice.conflictsTitle")}</h4>
            <ul className="voice-conflict-list">
              {classified.conflicts.map((patch) => (
                <li key={patch.field} className="voice-conflict-item">
                  <div>
                    <strong>{t(patch.labelKey || patch.field)}</strong>
                    {": "}
                    {t("voice.keepExisting")}
                    {" = "}
                    {String(patch.currentValue || t("voice.emptyField"))}
                    {"; "}
                    {t("voice.useVoice")}
                    {" = "}
                    {patch.displayValue ?? String(patch.value)}
                  </div>
                  <div className="voice-conflict-choices" role="group" aria-label={t(patch.labelKey || patch.field)}>
                    <Button
                      type="button"
                      size="sm"
                      variant={(conflictChoices[patch.field] || "keep") === "keep" ? "primary" : "secondary"}
                      onClick={() => setConflictChoices((current) => ({ ...current, [patch.field]: "keep" }))}
                    >
                      {t("voice.keepExisting")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={conflictChoices[patch.field] === "voice" ? "primary" : "secondary"}
                      onClick={() => setConflictChoices((current) => ({ ...current, [patch.field]: "voice" }))}
                    >
                      {t("voice.useVoice")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {proposal.unclear.length > 0 && (
          <div className="voice-unclear">
            <Alert type="warning">
              <strong>{t("voice.unclearTitle")}</strong>
              {" "}
              {t("voice.unclearHint")}
              <ul>
                {proposal.unclear.map((item) => (
                  <li key={`${item.code}-${item.detail || ""}`}>
                    {item.detail || t(item.messageKey || "voice.noPatches")}
                  </li>
                ))}
              </ul>
            </Alert>
          </div>
        )}
      </Modal>
    </section>
  );
}
