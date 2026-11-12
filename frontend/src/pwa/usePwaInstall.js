import { useEffect, useState } from "react";
import {
  isStandaloneDisplay,
  rememberInstallDismissed,
  wasInstallDismissedRecently,
} from "./registerServiceWorker";

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Captures beforeinstallprompt (Android/Chrome) and exposes install helpers.
 * Dismissal is remembered so the prompt is not shown repeatedly.
 */
export default function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => isStandaloneDisplay());
  const [canPrompt, setCanPrompt] = useState(false);
  const ios = isIosDevice();

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault();
      if (wasInstallDismissedRecently() || isStandaloneDisplay()) return;
      setDeferredPrompt(event);
      setCanPrompt(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setCanPrompt(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setCanPrompt(false);
    if (choice.outcome !== "accepted") {
      rememberInstallDismissed();
    }
    return choice.outcome === "accepted";
  };

  const dismiss = () => {
    rememberInstallDismissed();
    setCanPrompt(false);
    setDeferredPrompt(null);
  };

  return {
    installed,
    canPrompt,
    isIos: ios,
    showIosHelp: ios && !installed,
    install,
    dismiss,
  };
}
