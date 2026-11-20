import React, { useEffect, useRef } from "react";
import VoiceReceptionist from "../VoiceReceptionist";
import { useGlobalVoice } from "./GlobalVoiceContext";

/**
 * Single host for page workflows.
 * - screening: visible compact panel under the header
 * - registration (host=headless): engine only — fills the existing form, no extra UI
 */
export default function GlobalVoiceSession() {
  const {
    sessionActive,
    sessionNonce,
    voiceLocale,
    workflow,
    endPageWorkflow,
    registerStopHandler,
    registerPlaybackRetry,
    setPlaybackPhase,
    setTtsHint,
  } = useGlobalVoice();

  const receptionistRef = useRef(null);
  const startedNonceRef = useRef(0);

  useEffect(() => registerStopHandler(() => {
    receptionistRef.current?.stopAll?.();
    setPlaybackPhase?.("idle");
  }), [registerStopHandler, setPlaybackPhase]);

  useEffect(() => registerPlaybackRetry(() => {
    receptionistRef.current?.resume?.();
  }), [registerPlaybackRetry]);

  const hostable = Boolean(workflow && workflow.host !== "inline");

  useEffect(() => {
    if (!sessionActive || !hostable) return undefined;
    if (startedNonceRef.current === sessionNonce) return undefined;

    const tryStart = () => {
      if (!receptionistRef.current?.start) return false;
      startedNonceRef.current = sessionNonce;
      void receptionistRef.current.start(voiceLocale);
      return true;
    };

    if (tryStart()) return undefined;
    const timer = window.setTimeout(tryStart, 0);
    return () => window.clearTimeout(timer);
  }, [sessionActive, sessionNonce, voiceLocale, hostable, workflow]);

  useEffect(() => {
    if (sessionActive && !workflow) {
      endPageWorkflow();
    }
  }, [sessionActive, workflow, endPageWorkflow]);

  if (!sessionActive || !workflow || workflow.host === "inline") return null;

  const headless = workflow.host === "headless";

  return (
    <div
      className={headless ? "global-voice-session-headless" : "global-voice-session"}
      aria-live={headless ? "off" : "polite"}
    >
      <VoiceReceptionist
        ref={receptionistRef}
        mode={workflow.mode || workflow.id}
        variant={headless ? "headless" : "global"}
        locale={voiceLocale}
        hideLanguagePicker
        title={workflow.title}
        questions={workflow.questions}
        parseAnswer={workflow.parseAnswer}
        parseContext={workflow.parseContext}
        onFieldAccepted={workflow.onFieldAccepted}
        onApplyAnswers={workflow.onApplyAnswers}
        onRequestSubmit={workflow.onRequestSubmit}
        disabled={workflow.disabled}
        onSessionEnd={endPageWorkflow}
        onPlaybackState={setPlaybackPhase}
        onTtsHint={setTtsHint}
      />
    </div>
  );
}
