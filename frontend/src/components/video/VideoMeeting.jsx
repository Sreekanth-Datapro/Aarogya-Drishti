import React, { useEffect, useRef, useState } from "react";
import { Button } from "../ui";
import { useLanguage } from "../../i18n/LanguageContext";
import "./VideoMeeting.css";

const SCRIPT_SRC = "https://meet.jit.si/external_api.js";

function loadJitsiScript() {
  if (window.JitsiMeetExternalAPI) {
    return Promise.resolve();
  }
  const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script-error")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("script-error"));
    document.body.appendChild(script);
  });
}

/**
 * Embeds a public meet.jit.si room with the official IFrame External API.
 * Room name must come from an authenticated backend join call.
 */
export default function VideoMeeting({
  domain,
  roomName,
  displayName,
  onLeft,
  onPresence,
}) {
  const { t } = useLanguage();
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const presenceRef = useRef(onPresence);
  const [status, setStatus] = useState("loading");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    presenceRef.current = onPresence;
  }, [onPresence]);

  useEffect(() => {
    let cancelled = false;
    const emitPresence = (event) => {
      if (typeof presenceRef.current === "function") {
        Promise.resolve(presenceRef.current(event)).catch(() => {});
      }
    };

    async function start() {
      if (!domain || !roomName || !containerRef.current) {
        setStatus("error");
        setDetail(t("videoMeeting.missingRoom"));
        return;
      }
      setStatus("loading");
      setDetail(t("videoMeeting.loading"));
      try {
        await loadJitsiScript();
        if (cancelled || !containerRef.current) return;

        const api = new window.JitsiMeetExternalAPI(domain, {
          roomName,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          userInfo: {
            displayName: displayName || t("videoMeeting.guestName"),
          },
          configOverwrite: {
            prejoinPageEnabled: true,
            disableDeepLinking: true,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
          },
        });
        apiRef.current = api;

        api.addListener("videoConferenceJoined", () => {
          if (!cancelled) {
            setStatus("joined");
            setDetail(t("videoMeeting.joined"));
            emitPresence("JOINED");
          }
        });
        api.addListener("participantJoined", () => {
          if (!cancelled) setDetail(t("videoMeeting.participantJoined"));
        });
        api.addListener("participantLeft", () => {
          if (!cancelled) setDetail(t("videoMeeting.participantLeft"));
        });
        api.addListener("videoConferenceLeft", () => {
          if (!cancelled) {
            setStatus("ended");
            setDetail(t("videoMeeting.ended"));
            emitPresence("LEFT");
          }
        });
        api.addListener("readyToClose", () => {
          if (!cancelled) {
            setStatus("ended");
            setDetail(t("videoMeeting.ended"));
          }
        });

        setStatus("ready");
        setDetail(t("videoMeeting.ready"));
      } catch (_error) {
        if (!cancelled) {
          setStatus("error");
          setDetail(t("videoMeeting.connectionError"));
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (_error) {
          // Ignore dispose errors on unmount.
        }
        apiRef.current = null;
      }
    };
  }, [domain, roomName, displayName, t]);

  function leaveMeeting() {
    if (typeof presenceRef.current === "function") {
      Promise.resolve(presenceRef.current("LEFT")).catch(() => {});
    }
    if (apiRef.current) {
      try {
        apiRef.current.executeCommand("hangup");
        apiRef.current.dispose();
      } catch (_error) {
        // Hangup may fail if the room already closed.
      }
      apiRef.current = null;
    }
    setStatus("ended");
    setDetail(t("videoMeeting.left"));
    if (typeof onLeft === "function") onLeft();
  }

  return (
    <section className="video-meeting" aria-label={t("videoMeeting.title")}>
      <div className="video-meeting-toolbar">
        <p className="video-meeting-status" role="status">{detail}</p>
        <Button type="button" variant="danger" onClick={leaveMeeting}>
          {t("videoMeeting.leave")}
        </Button>
      </div>
      <p className="video-meeting-warning">{t("videoMeeting.publicWarning")}</p>
      <div className="video-meeting-frame-wrap">
        <div className="video-meeting-frame" ref={containerRef} />
        {(status === "loading" || status === "error" || status === "ended") && (
          <div className="video-meeting-overlay" role="status">
            <p>{detail}</p>
          </div>
        )}
      </div>
    </section>
  );
}
