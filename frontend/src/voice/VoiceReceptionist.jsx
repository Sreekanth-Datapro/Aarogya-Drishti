import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Check, Mic, MicOff, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Alert, Button } from "../components/ui";
import useConversationalReceptionist from "./useConversationalReceptionist";
import { RECEPTIONIST_LOCALES, normalizeReceptionistLocale } from "./receptionistLocales";
import "./voice.css";

/**
 * Conversational medical receptionist UI.
 * Valid answers advance automatically (no per-field yes/no).
 * Success only after onRequestSubmit returns { ok: true }.
 *
 * variant="global": compact host under the app header (screening).
 * variant="inline": embedded inside Patient Registration form.
 */
const VoiceReceptionist = forwardRef(function VoiceReceptionist({
  mode = "registration",
  questions = [],
  parseAnswer,
  parseContext,
  onApplyAnswers,
  onFieldAccepted,
  onRequestSubmit,
  disabled = false,
  title,
  locale: localeProp,
  hideLanguagePicker = false,
  variant = "page",
  onSessionEnd,
  onPlaybackState,
  onTtsHint,
}, ref) {
  void mode;

  const engine = useConversationalReceptionist({
    questions,
    parseAnswer,
    parseContext,
    onPlaybackState,
    onTtsHint,
    onFieldAccepted: (partial) => {
      onFieldAccepted?.(partial);
      if (!onFieldAccepted && onApplyAnswers) {
        onApplyAnswers({
          answers: partial.answers,
          displays: partial.displays,
          locale: partial.locale,
        });
      }
    },
    onComplete: async (payload) => {
      onApplyAnswers?.(payload);
      if (!onRequestSubmit) {
        return { ok: false, error: "Missing submit handler", code: "FAILED" };
      }
      return onRequestSubmit(payload);
    },
  });

  const onSessionEndRef = useRef(onSessionEnd);
  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  const prevPhaseRef = useRef(engine.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = engine.phase;
    if (prev !== "idle" && engine.phase === "idle") {
      onSessionEndRef.current?.();
      return undefined;
    }
    if (engine.phase === "success") {
      const timer = setTimeout(() => onSessionEndRef.current?.(), 1600);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [engine.phase]);

  useImperativeHandle(ref, () => ({
    start: (code) => {
      const locale = normalizeReceptionistLocale(code || localeProp || "en");
      return engine.startSession(locale);
    },
    stop: () => engine.cancelSession(),
    stopAll: () => engine.stopAll(),
    beginListen: () => engine.beginListen(),
    resume: () => engine.repeatButton(),
  }), [engine, localeProp]);

  const progressLabel = useMemo(() => {
    if (engine.phase === "idle" || engine.phase === "language") return "";
    if (["review", "ready", "submitting", "failed"].includes(engine.phase)) {
      return engine.t("finalReview");
    }
    if (engine.phase === "success") return engine.t("successfullySubmitted");
    return engine.t("progress", {
      current: Math.min(engine.index + 1, engine.totalQuestions || 1),
      total: engine.totalQuestions || 1,
    });
  }, [engine]);

  const showStartScreen = engine.phase === "idle" || engine.phase === "success" || engine.phase === "error";
  const showPostReview = ["ready", "submitting", "failed"].includes(engine.phase);
  const busy = disabled || engine.isSubmitting || engine.phase === "submitting";
  const isGlobal = variant === "global";
  const isInline = variant === "inline";
  const isHeadless = variant === "headless";
  const hideIdleChrome = (isGlobal || isInline || isHeadless) && showStartScreen;
  const listening = engine.speech.status === "listening";
  const speaking = engine.speaking;

  const statusLine = speaking
    ? engine.t("speaking")
    : listening
      ? engine.t("listening")
      : (engine.statusMessage || "");

  // Headless: engine runs and fills the page form; no duplicate voice panel UI.
  if (isHeadless) {
    return (
      <div className="voice-receptionist-headless" aria-live="polite">
        <span className="sr-only">
          {speaking ? engine.t("speaking") : listening ? engine.t("listening") : ""}
          {" "}
          {engine.currentQuestionText || ""}
        </span>
      </div>
    );
  }

  return (
    <section
      className={`voice-receptionist ${!showStartScreen ? "voice-receptionist-active" : ""} ${isGlobal ? "voice-receptionist-global" : ""} ${isInline ? "voice-receptionist-inline" : ""}`}
      aria-label={title || engine.t("title")}
    >
      {!hideIdleChrome ? (
        <div className="voice-receptionist-header">
          <div className="voice-receptionist-avatar" aria-hidden="true">
            <span className={`voice-receptionist-face ${speaking ? "is-speaking" : ""} ${listening ? "is-listening" : ""}`}>
              AD
            </span>
          </div>
          <div className="voice-receptionist-intro">
            <h3>{title || engine.t("title")}</h3>
            {!isGlobal && !isInline ? <p className="voice-receptionist-brand">{engine.t("brand")}</p> : null}
            {!isGlobal && !isInline ? <p className="voice-receptionist-micwhy">{engine.t("micWhy")}</p> : null}
          </div>
        </div>
      ) : null}

      {showStartScreen && !hideIdleChrome ? (
          <div className="voice-receptionist-start">
            {!hideLanguagePicker ? (
              <>
                <p className="voice-receptionist-pick">{engine.t("pickLanguage")}</p>
                <div className="voice-receptionist-langs" role="group" aria-label={engine.t("language")}>
                  {RECEPTIONIST_LOCALES.map((item) => (
                    <Button
                      key={item.code}
                      type="button"
                      variant={engine.locale === item.code ? "primary" : "secondary"}
                      disabled={disabled}
                      onClick={() => engine.startSession(item.code)}
                    >
                      {item.nativeLabel}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <Button
                type="button"
                disabled={disabled}
                onClick={() => engine.startSession(normalizeReceptionistLocale(localeProp || "en"))}
              >
                {engine.t("start")}
              </Button>
            )}
            {engine.speechStatusChecked && !engine.speechConfigured ? (
              <Alert type="warning">{engine.t("speechNotConfigured")}</Alert>
            ) : null}
            {engine.speechConfigured && !engine.supportedStt ? (
              <Alert type="warning">{engine.t("unsupportedStt")}</Alert>
            ) : null}
            {engine.phase === "success" ? (
              <Alert type="success">{engine.t("successfullySubmitted")}</Alert>
            ) : null}
          </div>
      ) : !showStartScreen ? (
        <>
          <div className="voice-receptionist-meta">
            <span className="voice-receptionist-lang-pill">
              {engine.t("language")}: {RECEPTIONIST_LOCALES.find((item) => item.code === engine.locale)?.nativeLabel}
            </span>
            {progressLabel ? <span className="voice-receptionist-progress">{progressLabel}</span> : null}
          </div>

          {engine.phase === "ready" ? (
            <Alert type="info">{engine.t("reviewCompleted")}</Alert>
          ) : null}
          {engine.phase === "submitting" ? (
            <Alert type="info">{engine.t("submitting")}</Alert>
          ) : null}
          {engine.phase === "failed" ? (
            <Alert type="error">
              {engine.submissionError || engine.t("submitFailed")}
              <div className="voice-receptionist-failed-hint">{engine.t("answersPreserved")}</div>
            </Alert>
          ) : null}

          <div className={`voice-receptionist-stage ${speaking ? "speaking" : ""} ${listening ? "listening" : ""}`}>
            <div className="voice-receptionist-stage-top">
              <p className="voice-receptionist-q-label">{engine.t("currentQuestion")}</p>
              <span
                className={`voice-mic-indicator ${speaking ? "is-speaking" : ""} ${listening ? "is-listening" : ""}`}
                aria-hidden="true"
              >
                {listening ? <Mic size={16} /> : speaking ? <Volume2 size={16} /> : <MicOff size={16} />}
              </span>
            </div>
            <p className="voice-receptionist-question">{engine.currentQuestionText || engine.statusMessage}</p>
            {statusLine ? (
              <p className={`voice-receptionist-state ${listening ? "listening-pulse" : ""}`}>{statusLine}</p>
            ) : null}
          </div>

          {(engine.lastAccepted?.displayValue || engine.speech.transcript || engine.speech.interimTranscript) ? (
            <div className="voice-receptionist-answer">
              <p className="voice-receptionist-q-label">{engine.t("recognizedAnswer")}</p>
              <p className="voice-receptionist-transcript">
                {engine.lastAccepted?.displayValue
                  || engine.speech.transcript
                  || engine.speech.interimTranscript
                  || engine.t("emptyValue")}
              </p>
            </div>
          ) : null}

          {(engine.phase === "review" || showPostReview) && engine.reviewLines.length ? (
            <ul className="voice-receptionist-review">
              {engine.reviewLines.map((line) => (
                <li key={line.id} className="voice-receptionist-review-item">
                  <span><strong>{line.label}:</strong> {line.value}</span>
                  {engine.phase === "review" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => engine.jumpToField(line.id)}
                    >
                      {engine.t("editField")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {engine.errorMessage && engine.phase !== "failed" ? (
            <Alert type="warning">{engine.errorMessage}</Alert>
          ) : null}

          {!showPostReview && (engine.phase === "listening" || engine.phase === "review" || engine.phase === "asking") ? (
            <div className="voice-receptionist-typed">
              <label className="voice-receptionist-q-label" htmlFor="voice-typed-answer">
                {engine.t("typeAnswer")}
              </label>
              <div className="voice-receptionist-typed-row">
                <input
                  id="voice-typed-answer"
                  type="text"
                  value={engine.typedDraft}
                  disabled={busy || speaking}
                  onChange={(event) => engine.setTypedDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      engine.submitTypedAnswer();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || speaking || !String(engine.typedDraft || "").trim()}
                  onClick={() => engine.submitTypedAnswer()}
                >
                  {engine.t("submitTyped")}
                </Button>
              </div>
            </div>
          ) : null}

          <div className={`voice-receptionist-actions ${isInline ? "voice-receptionist-actions-inline" : ""}`}>
            {/* Manual mic is retry-only; auto-listen runs after each TTS prompt. */}
            {!showPostReview ? (
              <Button
                type="button"
                className="voice-receptionist-mic"
                variant="secondary"
                disabled={busy || speaking || !engine.supportedStt}
                onClick={() => {
                  if (listening) {
                    engine.speech.stop();
                    return;
                  }
                  engine.beginListen();
                }}
                aria-label={engine.t("mic")}
                title={engine.t("mic")}
              >
                {listening ? <MicOff size={isInline ? 18 : 28} /> : <Mic size={isInline ? 18 : 28} />}
                <span>{listening ? "Stop" : "Retry mic"}</span>
              </Button>
            ) : null}

            <div className="voice-receptionist-secondary">
              {engine.phase === "failed" ? (
                <Button type="button" disabled={busy} onClick={engine.retrySubmit}>
                  {engine.t("retrySubmit")}
                </Button>
              ) : null}
              {!showPostReview ? (
                <>
                  <Button type="button" variant="secondary" disabled={busy} onClick={engine.repeatButton}>
                    <RotateCcw size={16} /> {engine.t("repeatQ")}
                  </Button>
                  {engine.phase === "review" ? (
                    <Button type="button" disabled={busy} onClick={engine.confirmButton}>
                      <Check size={16} /> {engine.t("applyAndSubmit")}
                    </Button>
                  ) : null}
                </>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => engine.setMuted(!engine.muted)}
              >
                {engine.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                {engine.muted ? engine.t("unmute") : engine.t("mute")}
              </Button>
              {!isInline ? (
                <Button type="button" variant="secondary" disabled={busy} onClick={engine.cancelSession}>
                  {engine.t("stop")}
                </Button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
});

export default VoiceReceptionist;
