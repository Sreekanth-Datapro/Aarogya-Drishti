import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { Alert, Button } from "../../components/ui";
import VideoMeeting from "../../components/video/VideoMeeting";

export default function VideoConsultationMeeting() {
  const { consultationId } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [join, setJoin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadJoin = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.post(`/video-consultations/${consultationId}/join`);
      setJoin(response.data?.join || null);
    } catch (requestError) {
      setJoin(null);
      setError(requestError?.response?.data?.message || t("videoMeeting.joinFailed"));
    } finally {
      setLoading(false);
    }
  }, [consultationId, t]);

  useEffect(() => {
    loadJoin();
  }, [loadJoin]);

  return (
    <div className="care-page">
      <header className="care-hero">
        <p className="care-eyebrow">{t("videoMeeting.eyebrow")}</p>
        <h1 className="page-title">{t("videoMeeting.title")}</h1>
        <p className="page-subtitle">{t("videoMeeting.subtitle")}</p>
      </header>

      {loading && <p className="care-muted" role="status">{t("videoMeeting.authorizing")}</p>}
      {error && (
        <Alert type="error">
          {error}
          <div style={{ marginTop: "0.75rem" }}>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              {t("videoMeeting.back")}
            </Button>
            <Button type="button" onClick={loadJoin} style={{ marginLeft: "0.5rem" }}>
              {t("videoMeeting.retry")}
            </Button>
          </div>
        </Alert>
      )}

      {!loading && !error && join?.room_ref && join?.domain && (
        <VideoMeeting
          domain={join.domain}
          roomName={join.room_ref}
          displayName={join.display_name}
          onLeft={() => navigate(-1)}
        />
      )}
    </div>
  );
}
