import { useEffect } from "react";
import { useGlobalVoiceOptional } from "./GlobalVoiceContext";

/**
 * Pages register their receptionist workflow (questions + handlers).
 * Unregisters on unmount / route leave so screening never keeps registration questions.
 */
export default function useRegisterVoiceWorkflow(config) {
  const voice = useGlobalVoiceOptional();

  useEffect(() => {
    if (!voice || !config?.id) return undefined;
    return voice.registerWorkflow(config);
  }, [
    voice,
    config,
  ]);
}
