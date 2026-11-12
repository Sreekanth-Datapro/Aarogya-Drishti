import React, { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  getPatientDisplayName,
  getPatientNameCorrection,
  savePatientNameCorrection,
  transliterateEnglishNameToTelugu,
} from "../../utils/patientName";

export default function PatientName({
  patientId,
  name,
  allowCorrection = false,
}) {
  const { language, t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const automaticName = transliterateEnglishNameToTelugu(name);
  const savedCorrection = getPatientNameCorrection(patientId, name);
  const [teluguName, setTeluguName] = useState(savedCorrection || automaticName);
  const [saved, setSaved] = useState(Boolean(savedCorrection));

  useEffect(() => {
    const correction = getPatientNameCorrection(patientId, name);
    const nextName = correction || transliterateEnglishNameToTelugu(name);
    setTeluguName(nextName);
    setSaved(Boolean(correction));
  }, [patientId, name, language]);

  const displayName = getPatientDisplayName({
    name,
    language,
    patientId,
    correctedTeluguName: saved ? teluguName : "",
  });

  const saveCorrection = () => {
    const corrected = teluguName.trim();
    if (!corrected) return;

    if (savePatientNameCorrection(patientId, name, corrected)) {
      setSaved(true);
      setEditing(false);
    }
  };

  if (language !== "te") {
    return <span lang="en">{name}</span>;
  }

  return (
    <span lang="te">
      <span>{displayName}</span>
      {allowCorrection && (
        <>
          {!editing ? (
            <button type="button" onClick={() => setEditing(true)}>
              {t("patientName.correct")}
            </button>
          ) : (
            <span>
              <input
                type="text"
                value={teluguName}
                onChange={(event) => setTeluguName(event.target.value)}
                aria-label={t("patientName.inputLabel")}
              />
              <button type="button" onClick={saveCorrection}>{t("patientName.save")}</button>
              <button type="button" onClick={() => setEditing(false)}>{t("patientName.cancel")}</button>
            </span>
          )}
        </>
      )}
    </span>
  );
}
