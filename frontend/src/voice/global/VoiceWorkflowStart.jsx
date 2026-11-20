import React, { useState } from "react";
import { Mic } from "lucide-react";
import { Button } from "../../components/ui";
import { useGlobalVoiceOptional } from "./GlobalVoiceContext";

/**
 * Small page-level CTA — does not start until the user clicks.
 * Click also unlocks browser audio for Sarvam TTS playback.
 */
export default function VoiceWorkflowStart({ label, disabled = false }) {
  const voice = useGlobalVoiceOptional();
  const [starting, setStarting] = useState(false);
  if (!voice) return null;

  const ready = Boolean(voice.workflowMeta?.id);
  const busy = voice.sessionActive || starting;

  return (
    <div className="voice-workflow-start">
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || !ready || busy}
        onClick={async () => {
          setStarting(true);
          try {
            await voice.startPageWorkflow();
          } finally {
            setStarting(false);
          }
        }}
      >
        <Mic size={16} aria-hidden="true" />
        <span>{label || voice.workflowMeta?.startLabel || "Start by Voice"}</span>
      </Button>
      {!voice.voiceEnabled ? (
        <p className="voice-workflow-start-hint">
          Turn Voice ON in the header, then start when ready.
        </p>
      ) : (
        <p className="voice-workflow-start-hint">
          Uses header voice language ({voice.voiceLocale === "te" ? "తెలుగు" : voice.voiceLocale === "hi" ? "हिन्दी" : "English (India)"}).
        </p>
      )}
    </div>
  );
}
