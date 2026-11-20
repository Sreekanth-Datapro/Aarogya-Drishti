import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useAzureSpeechRecognition from "./useAzureSpeechRecognition";
import { fetchSpeechStatus } from "./azureSpeechClient";
import { cancelAzureSpeech, isAudioUnlocked, isAzureTtsSupported, speakAzureText, unlockAzureAudio } from "./azureTtsPlayer";
import {
  classifyConfirmation,
  normalizeReceptionistLocale,
  receptionistBcp47,
} from "./receptionistLocales";
import { fieldLabel, receptionistText } from "./receptionistCopy";
import { normalizeSubmitResult } from "./submissionResult";
import {
  buildOkayAck,
  detectChangeFieldIntent,
  shouldAutoAdvance,
  shouldRepeatQuestion,
} from "./conversationFlow";

/**
 * Question-by-question conversational receptionist.
 *
 * Per-field flow: ask → listen → validate → save → ack → next (NO yes/no).
 * Final review still requires one explicit confirmation before submit.
 * Submission: ready → submitting → success | failed (D1).
 */
export default function useConversationalReceptionist({
  questions = [],
  parseAnswer,
  parseContext,
  muted: mutedProp = false,
  onComplete,
  onFieldAccepted,
  onCancel,
  onPlaybackState,
  onTtsHint,
} = {}) {
  const [locale, setLocale] = useState("en");
  const [phase, setPhase] = useState("idle");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [displays, setDisplays] = useState({});
  const [lastAccepted, setLastAccepted] = useState(null);
  const [currentQuestionText, setCurrentQuestionText] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [muted, setMuted] = useState(mutedProp);
  const [speaking, setSpeaking] = useState(false);
  const [reviewLines, setReviewLines] = useState([]);
  const [submissionError, setSubmissionError] = useState("");
  const [speechConfigured, setSpeechConfigured] = useState(false);
  const [speechStatusChecked, setSpeechStatusChecked] = useState(false);
  const [typedDraft, setTypedDraft] = useState("");

  const phaseRef = useRef(phase);
  const indexRef = useRef(index);
  const mutedRef = useRef(muted);
  const localeRef = useRef(locale);
  const answersRef = useRef(answers);
  const displaysRef = useRef(displays);
  const questionsRef = useRef(questions);
  const parseAnswerRef = useRef(parseAnswer);
  const parseContextRef = useRef(parseContext);
  const onCompleteRef = useRef(onComplete);
  const onFieldAcceptedRef = useRef(onFieldAccepted);
  const onPlaybackStateRef = useRef(onPlaybackState);
  const onTtsHintRef = useRef(onTtsHint);
  const speakChainRef = useRef(Promise.resolve());
  const autoListenRef = useRef(false);
  const lastProcessedRef = useRef("");
  const completedPayloadRef = useRef(null);
  const submittingRef = useRef(false);
  const returnToReviewRef = useRef(false);
  const lastSpeechErrorHandledRef = useRef("");

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { localeRef.current = locale; }, [locale]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { displaysRef.current = displays; }, [displays]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { parseAnswerRef.current = parseAnswer; }, [parseAnswer]);
  useEffect(() => { parseContextRef.current = parseContext; }, [parseContext]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onFieldAcceptedRef.current = onFieldAccepted; }, [onFieldAccepted]);
  useEffect(() => { onPlaybackStateRef.current = onPlaybackState; }, [onPlaybackState]);
  useEffect(() => { onTtsHintRef.current = onTtsHint; }, [onTtsHint]);

  const bcp47 = useMemo(() => receptionistBcp47(locale), [locale]);
  const speechStatusPromiseRef = useRef(null);

  const ensureSpeechStatus = useCallback(async () => {
    if (speechStatusChecked) return speechConfigured;
    if (!speechStatusPromiseRef.current) {
      speechStatusPromiseRef.current = (async () => {
        try {
          const status = await fetchSpeechStatus();
          const configured = Boolean(status?.configured);
          setSpeechConfigured(configured);
          return configured;
        } catch {
          setSpeechConfigured(false);
          return false;
        } finally {
          setSpeechStatusChecked(true);
        }
      })();
    }
    return speechStatusPromiseRef.current;
  }, [speechConfigured, speechStatusChecked]);

  useEffect(() => {
    void ensureSpeechStatus();
  }, [ensureSpeechStatus]);

  const speech = useAzureSpeechRecognition({
    lang: bcp47,
    enabled: speechConfigured,
  });
  const speechAbortRef = useRef(() => {});
  useEffect(() => {
    speechAbortRef.current = () => speech.abort?.();
  }, [speech]);

  const t = useCallback((key, values) => receptionistText(localeRef.current, key, values), []);

  const speak = useCallback(async (text) => {
    setStatusMessage(text);
    if (mutedRef.current || !text) return { ok: true, skipped: true };
    if (!isAzureTtsSupported()) {
      const message = t("unsupportedTts");
      setErrorMessage(message);
      onTtsHintRef.current?.(message);
      return { ok: false, code: "TTS_UNSUPPORTED" };
    }
    const configured = await ensureSpeechStatus();
    if (!configured) {
      const message = t("ttsNotConfigured");
      setErrorMessage(message);
      onTtsHintRef.current?.(message);
      return { ok: false, code: "TTS_NOT_CONFIGURED" };
    }
    // Never capture mic audio while the app is speaking.
    autoListenRef.current = false;
    speechAbortRef.current();
    setSpeaking(true);
    onPlaybackStateRef.current?.("speaking");
    setErrorMessage("");
    onTtsHintRef.current?.("");

    if (!isAudioUnlocked()) {
      await unlockAzureAudio();
    }

    let outcome = { ok: false, code: "TTS_FAILED" };
    speakChainRef.current = speakChainRef.current
      .catch(() => {})
      .then(() => speakAzureText(text, { lang: receptionistBcp47(localeRef.current) }))
      .then((result) => {
        // Cancelled / silent early-stop must NOT count as audible success.
        if (result?.cancelled || result?.ok === false) {
          outcome = {
            ok: false,
            code: result?.code || "TTS_CANCELLED",
            cancelled: Boolean(result?.cancelled),
          };
          return result;
        }
        outcome = { ok: true, ...(result || {}) };
        return result;
      })
      .catch((error) => {
        const code = error?.code || error?.message || "TTS_FAILED";
        let message = t("ttsFallback");
        if (code === "TTS_UNSUPPORTED") message = t("unsupportedTts");
        else if (code === "TTS_NOT_CONFIGURED" || code === "SPEECH_NOT_CONFIGURED") message = t("ttsNotConfigured");
        else if (
          code === "TTS_AUTOPLAY_BLOCKED"
          || code === "TTS_PLAY_FAILED"
          || code === "TTS_PLAYBACK_ERROR"
          || code === "TTS_DECODE_FAILED"
        ) {
          message = t("ttsAutoplayBlocked");
        }
        setErrorMessage(message);
        onTtsHintRef.current?.(message);
        outcome = { ok: false, code: String(code) };
      })
      .finally(() => {
        setSpeaking(false);
        // Keep "Speaking…" until playback promise settles; then idle until listen starts.
        onPlaybackStateRef.current?.("idle");
      });
    await speakChainRef.current;
    return outcome;
  }, [ensureSpeechStatus, t]);

  const stopAll = useCallback(() => {
    cancelAzureSpeech();
    speechAbortRef.current();
    setSpeaking(false);
    autoListenRef.current = false;
  }, []);

  // True unmount only — do NOT depend on `speech` (new object every render),
  // or React cleanup will cancel TTS mid-play while UI still shows Speaking…
  useEffect(() => () => {
    cancelAzureSpeech();
    speechAbortRef.current();
  }, []);

  const currentQuestion = questions[index] || null;
  const totalQuestions = questions.length;

  const buildReviewLines = useCallback((answerMap, displayMap) => {
    return (questionsRef.current || []).map((question) => {
      const display = displayMap[question.id];
      const value = answerMap[question.id];
      const shown = display != null && display !== ""
        ? display
        : (value == null || value === "" ? t("emptyValue") : String(value));
      return {
        id: question.id,
        label: fieldLabel(question.id, localeRef.current),
        value: shown,
      };
    }).filter((line) => line.value !== t("emptyValue") || !questionsRef.current.find((q) => q.id === line.id)?.optional);
  }, [t]);

  const enterReview = useCallback(async () => {
    const lines = buildReviewLines(answersRef.current, displaysRef.current);
    setReviewLines(lines);
    setPhase("review");
    phaseRef.current = "review";
    const reviewSpeech = [
      t("reviewIntro"),
      ...lines.map((line) => t("reviewItem", { label: line.label, value: line.value })),
      t("reviewAsk"),
    ].join(" ");
    setCurrentQuestionText(t("finalReview"));
    const spoken = await speak(reviewSpeech);
    if (spoken && spoken.ok === false) {
      autoListenRef.current = false;
      return;
    }
    autoListenRef.current = true;
  }, [buildReviewLines, speak, t]);

  const askAt = useCallback(async (nextIndex) => {
    const list = questionsRef.current || [];
    if (nextIndex >= list.length) {
      setIndex(nextIndex);
      await enterReview();
      return;
    }

    const question = list[nextIndex];
    if (typeof question.shouldAsk === "function") {
      const ctx = {
        answers: answersRef.current,
        ...(parseContextRef.current || {}),
      };
      if (!question.shouldAsk(ctx)) {
        await askAt(nextIndex + 1);
        return;
      }
    }

    setIndex(nextIndex);
    indexRef.current = nextIndex;
    setLastAccepted(null);
    setPhase("asking");
    const qText = typeof question.prompt === "function"
      ? question.prompt(localeRef.current, {
        answers: answersRef.current,
        ...(parseContextRef.current || {}),
      })
      : question.prompt;
    setCurrentQuestionText(qText);
    const spoken = await speak(qText);
    // Never show Listening / open mic until TTS finished successfully (not cancelled/blocked).
    if (!spoken || spoken.ok !== true) {
      setPhase("asking");
      phaseRef.current = "asking";
      autoListenRef.current = false;
      if (spoken?.code === "TTS_AUTOPLAY_BLOCKED" || spoken?.code === "TTS_PLAY_FAILED" || spoken?.code === "TTS_PLAYBACK_ERROR") {
        onTtsHintRef.current?.(t("ttsAutoplayBlocked"));
      }
      return;
    }
    setPhase("listening");
    phaseRef.current = "listening";
    autoListenRef.current = true;
  }, [enterReview, speak, t]);

  const buildCompletedPayload = useCallback(() => ({
    answers: answersRef.current,
    displays: displaysRef.current,
    locale: localeRef.current,
    reviewLines,
  }), [reviewLines]);

  const notifyFieldAccepted = useCallback((fieldId, value, displayValue, meta) => {
    onFieldAcceptedRef.current?.({
      fieldId,
      value,
      displayValue,
      meta,
      answers: answersRef.current,
      displays: displaysRef.current,
      locale: localeRef.current,
    });
  }, []);

  const saveAnswer = useCallback((question, item) => {
    if (item?.skip) {
      setAnswers((current) => {
        const next = { ...current };
        delete next[question.id];
        delete next[`__meta_${question.id}`];
        answersRef.current = next;
        return next;
      });
      setDisplays((current) => {
        const next = { ...current };
        delete next[question.id];
        displaysRef.current = next;
        return next;
      });
      setLastAccepted({ fieldId: question.id, displayValue: t("none"), skipped: true });
      notifyFieldAccepted(question.id, "", t("none"), { skip: true });
      return;
    }

    setAnswers((current) => {
      const next = {
        ...current,
        [question.id]: item.value,
        [`__meta_${question.id}`]: item.meta || null,
      };
      answersRef.current = next;
      return next;
    });
    setDisplays((current) => {
      const next = { ...current, [question.id]: item.displayValue };
      displaysRef.current = next;
      return next;
    });
    setLastAccepted({
      fieldId: question.id,
      displayValue: item.displayValue,
      value: item.value,
    });
    notifyFieldAccepted(question.id, item.value, item.displayValue, item.meta);
  }, [notifyFieldAccepted, t]);

  const advanceAfterSave = useCallback(async () => {
    if (returnToReviewRef.current) {
      returnToReviewRef.current = false;
      await enterReview();
      return;
    }
    await askAt(indexRef.current + 1);
  }, [askAt, enterReview]);

  const jumpToField = useCallback(async (fieldId) => {
    const list = questionsRef.current || [];
    const idx = list.findIndex((question) => question.id === fieldId);
    if (idx < 0) return;
    stopAll();
    returnToReviewRef.current = phaseRef.current === "review"
      || phaseRef.current === "ready"
      || phaseRef.current === "failed"
      || indexRef.current >= list.length;
    setErrorMessage("");
    await askAt(idx);
  }, [askAt, stopAll]);

  const runSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmissionError("");
    setPhase("submitting");
    phaseRef.current = "submitting";
    await speak(t("submitting"));

    const payload = completedPayloadRef.current || buildCompletedPayload();
    completedPayloadRef.current = payload;

    let normalized = { ok: false, error: "", code: "FAILED" };
    try {
      const raw = await onCompleteRef.current?.(payload);
      normalized = normalizeSubmitResult(raw === undefined ? { ok: false, code: "FAILED" } : raw);
    } catch (error) {
      normalized = {
        ok: false,
        error: error?.message || "",
        code: "NETWORK",
      };
    }

    submittingRef.current = false;
    if (normalized.ok) {
      setPhase("success");
      phaseRef.current = "success";
      setStatusMessage(t("successfullySubmitted"));
      await speak(t("successfullySubmitted"));
      return;
    }

    setPhase("failed");
    phaseRef.current = "failed";
    const message = normalized.error || t("submitFailed");
    setSubmissionError(message);
    setStatusMessage(t("submitFailed"));
    await speak(t("submitFailed"));
  }, [buildCompletedPayload, speak, t]);

  const startSession = useCallback(async (selectedLocale) => {
    stopAll();
    submittingRef.current = false;
    completedPayloadRef.current = null;
    returnToReviewRef.current = false;
    const code = normalizeReceptionistLocale(selectedLocale);
    setLocale(code);
    localeRef.current = code;
    setAnswers({});
    setDisplays({});
    answersRef.current = {};
    displaysRef.current = {};
    setLastAccepted(null);
    setErrorMessage("");
    setSubmissionError("");
    setReviewLines([]);
    setIndex(0);
    setPhase("welcome");
    const welcome = await speak(receptionistText(code, "welcome"));
    if (welcome && welcome.ok === false) {
      setPhase("asking");
      phaseRef.current = "asking";
      autoListenRef.current = false;
      return;
    }
    await askAt(0);
  }, [askAt, speak, stopAll]);

  const cancelSession = useCallback(() => {
    stopAll();
    setPhase("idle");
    setStatusMessage(t("cancelled"));
    onCancel?.();
  }, [onCancel, stopAll, t]);

  const beginListen = useCallback(() => {
    // Never open the mic while TTS is playing or another capture is live.
    if (speaking) return;
    if (speech.status === "listening") return;
    if (!speechConfigured) {
      setErrorMessage(t("speechNotConfigured"));
      return;
    }
    if (!speech.supported) {
      setErrorMessage(t("unsupportedStt"));
      return;
    }
    speech.clear();
    setTypedDraft("");
    setErrorMessage("");
    setPhase(phaseRef.current === "review" ? "review" : "listening");
    if (phaseRef.current !== "review") {
      phaseRef.current = "listening";
    }
    onPlaybackStateRef.current?.("listening");
    speech.start();
  }, [speech, speechConfigured, speaking, t]);

  useEffect(() => {
    if (!autoListenRef.current) return;
    if (speaking) return;
    if (phase !== "listening" && phase !== "review") return;
    // Wait until any in-flight capture ends before arming a new one.
    if (speech.status === "listening") return;
    autoListenRef.current = false;
    beginListen();
  }, [speaking, phase, beginListen, speech.status]);

  // Keep a stable ref so soft-error retries can call beginListen without stale closures.
  const beginListenRef = useRef(beginListen);
  useEffect(() => {
    beginListenRef.current = beginListen;
  }, [beginListen]);

  const processAnswerTranscript = useCallback(async (rawText) => {
    const text = String(rawText || "").trim();
    speech.stop();
    const question = questionsRef.current[indexRef.current];
    if (!question) return;

    if (!text) {
      setErrorMessage(t("noSpeech"));
      await speak(t("unclear"));
      setPhase("listening");
      phaseRef.current = "listening";
      autoListenRef.current = true;
      return;
    }

    const questionIds = (questionsRef.current || []).map((item) => item.id);
    const changeField = detectChangeFieldIntent(text, questionIds);
    if (changeField) {
      await speak(t("repeat"));
      await jumpToField(changeField);
      return;
    }

    const intent = classifyConfirmation(text);
    if (intent === "repeat") {
      await speak(t("repeat"));
      await askAt(indexRef.current);
      return;
    }

    const ctx = {
      ...(parseContextRef.current || {}),
      answers: answersRef.current,
      form: parseContextRef.current?.form,
    };
    const parsed = parseAnswerRef.current?.(question.id, text, ctx) || { ok: false, errorKey: "unclear" };

    if (shouldRepeatQuestion(parsed, question)) {
      if (parsed.skip && !question.optional) {
        await speak(t("cannotSkip"));
      } else {
        const hint = t(parsed.errorKey || "unclear");
        await speak(t("invalid", { hint }));
      }
      setPhase("listening");
      phaseRef.current = "listening";
      autoListenRef.current = true;
      return;
    }

    if (!shouldAutoAdvance(parsed, question)) {
      await speak(t("unclear"));
      setPhase("listening");
      phaseRef.current = "listening";
      autoListenRef.current = true;
      return;
    }

    // Valid (or optional skip): save immediately, ack, advance — no yes/no.
    const displayValue = parsed.skip
      ? t("none")
      : (parsed.displayValue ?? String(parsed.value ?? ""));
    saveAnswer(question, {
      skip: Boolean(parsed.skip),
      value: parsed.skip ? "" : parsed.value,
      displayValue,
      meta: parsed,
      raw: text,
    });

    if (parsed.skip) {
      await speak(t("skipped"));
    } else {
      await speak(buildOkayAck(t("okayAck"), displayValue));
    }
    await advanceAfterSave();
  }, [advanceAfterSave, askAt, jumpToField, saveAnswer, speak, speech, t]);

  const processReviewTranscript = useCallback(async (rawText) => {
    const text = String(rawText || "").trim();
    speech.stop();

    const questionIds = (questionsRef.current || []).map((item) => item.id);
    const changeField = detectChangeFieldIntent(text, questionIds);
    if (changeField) {
      await jumpToField(changeField);
      return;
    }

    const intent = classifyConfirmation(text);
    if (intent === "yes") {
      completedPayloadRef.current = buildCompletedPayload();
      setPhase("ready");
      phaseRef.current = "ready";
      setStatusMessage(t("reviewCompleted"));
      await speak(t("reviewCompleted"));
      await runSubmit();
      return;
    }
    if (intent === "no") {
      // Do not wipe the interview — guide user to edit one field.
      await speak(t("reviewEditHint"));
      setPhase("review");
      phaseRef.current = "review";
      autoListenRef.current = true;
      return;
    }
    if (intent === "repeat") {
      await enterReview();
      return;
    }
    await speak(t("yesNoHint"));
    autoListenRef.current = true;
  }, [buildCompletedPayload, enterReview, jumpToField, runSubmit, speak, speech, t]);

  const consumeTranscript = useCallback(async () => {
    const text = (speech.transcript || "").trim();
    if (!text) return;
    const token = `${phaseRef.current}:${text}`;
    if (lastProcessedRef.current === token) return;
    lastProcessedRef.current = token;
    if (phaseRef.current === "listening") {
      await processAnswerTranscript(text);
      speech.clear();
      return;
    }
    if (phaseRef.current === "review") {
      await processReviewTranscript(text);
      speech.clear();
    }
  }, [processAnswerTranscript, processReviewTranscript, speech]);

  useEffect(() => {
    if (speech.status !== "idle") return;
    if (!speech.transcript.trim()) return;
    if (!["listening", "review"].includes(phaseRef.current)) return;
    void consumeTranscript();
  }, [speech.status, speech.transcript, consumeTranscript]);

  useEffect(() => {
    if (!speech.errorKey) {
      lastSpeechErrorHandledRef.current = "";
      return;
    }
    const token = `${speech.errorKey}:${phaseRef.current}:${indexRef.current}`;
    if (lastSpeechErrorHandledRef.current === token) return;
    lastSpeechErrorHandledRef.current = token;

    const map = {
      "voice.micDenied": "micDenied",
      "voice.noSpeech": "noSpeech",
      "voice.networkError": "networkError",
      "voice.localeUnsupported": "localeUnsupported",
      "voice.unsupported": "unsupportedStt",
      "voice.speechNotConfigured": "speechNotConfigured",
      "voice.micUnavailable": "micDenied",
      "voice.recognitionFailed": "unclear",
    };
    const key = map[speech.errorKey] || "unclear";
    setErrorMessage(t(key));

    // Soft STT failures: re-prompt then auto-open mic again (no extra click).
    // Mic permission failures stay manual (typing / browser allow).
    if (!["listening", "review"].includes(phaseRef.current)) return;
    if (speech.errorKey === "voice.micDenied" || speech.errorKey === "voice.micUnavailable") {
      autoListenRef.current = false;
      return;
    }
    if (speech.errorKey === "voice.noSpeech" || speech.errorKey === "voice.recognitionFailed") {
      autoListenRef.current = false;
      void (async () => {
        await speak(t("unclear"));
        if (!["listening", "review"].includes(phaseRef.current)) return;
        // Direct retry after TTS; do not leave autoListen armed (avoids double-start).
        beginListenRef.current();
      })();
    }
  }, [speech.errorKey, speak, t]);

  const confirmButton = useCallback(async () => {
    if (phase !== "review") return;
    completedPayloadRef.current = buildCompletedPayload();
    setPhase("ready");
    phaseRef.current = "ready";
    setStatusMessage(t("reviewCompleted"));
    await speak(t("reviewCompleted"));
    await runSubmit();
  }, [buildCompletedPayload, phase, runSubmit, speak, t]);

  const retrySubmit = useCallback(async () => {
    if (submittingRef.current) return;
    if (phase !== "failed" && phase !== "ready") return;
    await runSubmit();
  }, [phase, runSubmit]);

  const repeatButton = useCallback(async () => {
    stopAll();
    if (phase === "review") {
      await enterReview();
      return;
    }
    await askAt(indexRef.current);
  }, [askAt, enterReview, phase, stopAll]);

  return {
    locale,
    setLocale,
    phase,
    index,
    totalQuestions,
    currentQuestion,
    currentQuestionText,
    statusMessage,
    errorMessage,
    submissionError,
    answers,
    displays,
    lastAccepted,
    reviewLines,
    speaking,
    muted,
    setMuted: (value) => {
      setMuted(value);
      if (value) cancelAzureSpeech();
    },
    speech,
    bcp47,
    t,
    typedDraft,
    setTypedDraft,
    submitTypedAnswer: async () => {
      const text = String(typedDraft || "").trim();
      if (!text) return;
      setTypedDraft("");
      if (phaseRef.current === "listening") {
        await processAnswerTranscript(text);
        return;
      }
      if (phaseRef.current === "review") {
        await processReviewTranscript(text);
      }
    },
    startSession,
    cancelSession,
    beginListen,
    confirmButton,
    repeatButton,
    retrySubmit,
    jumpToField,
    stopAll,
    isSubmitting: phase === "submitting",
    speechConfigured,
    speechStatusChecked,
    supportedStt: speechConfigured && speech.supported,
    supportedTts: speechConfigured && isAzureTtsSupported(),
  };
}
