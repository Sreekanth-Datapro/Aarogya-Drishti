import React from "react";
import { VideoOff } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { Badge, Button } from "../../components/ui";

// Jitsi Meet is not set up yet, so joining is switched off.
// No meeting address or token is created on this page.
export default function VideoNotConfigured() {
  const { t } = useLanguage();

  return (
    <section className="district-card care-video" aria-labelledby="care-video-title">
      <div className="care-video-head">
        <span className="care-video-icon" aria-hidden="true"><VideoOff size={22} /></span>
        <div>
          <h2 id="care-video-title" className="care-video-title">{t("care.video.title")}</h2>
          <p className="care-muted">{t("care.video.text")}</p>
        </div>
      </div>

      <dl className="care-video-status">
        <div>
          <dt>{t("care.video.server")}</dt>
          <dd><Badge tone="warning">{t("care.video.serverValue")}</Badge></dd>
        </div>
        <div>
          <dt>{t("care.video.joining")}</dt>
          <dd><Badge tone="neutral">{t("care.video.joiningValue")}</Badge></dd>
        </div>
        <div>
          <dt>{t("care.video.recording")}</dt>
          <dd><Badge tone="success">{t("care.video.recordingValue")}</Badge></dd>
        </div>
      </dl>

      <Button type="button" disabled aria-describedby="care-video-fallback">{t("care.video.join")}</Button>
      <p id="care-video-fallback" className="care-muted">{t("care.video.fallback")}</p>
    </section>
  );
}
