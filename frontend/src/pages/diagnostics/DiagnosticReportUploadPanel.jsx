import React, { useMemo, useRef, useState } from "react";
import { FileUp, Trash2, UploadCloud } from "lucide-react";
import api from "../../services/api";
import { useLanguage } from "../../i18n/LanguageContext";
import { apiMessage } from "../../i18n/translate";
import { Alert, Button } from "../../components/ui";

const ACCEPTED = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 20;
const ALLOWED_EXT = new Set(["pdf", "jpg", "jpeg", "png"]);

function formatBytes(size) {
  if (!Number.isFinite(size)) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKey(file) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function extensionOf(name) {
  const parts = String(name || "").toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function countByCategory(existingByCategory, entries) {
  const counts = { ...existingByCategory };
  for (const entry of entries) {
    counts[entry.category] = (counts[entry.category] || 0) + 1;
  }
  return counts;
}

function nextUnmetCategory(requiredDocuments, counts) {
  if (!requiredDocuments?.length) return "GENERAL_REPORT";
  for (const doc of requiredDocuments) {
    const have = counts[doc.code] || 0;
    if (have < (doc.min_files || 1)) return doc.code;
  }
  const multi = requiredDocuments.find((doc) => doc.allow_multiple);
  return (multi || requiredDocuments[requiredDocuments.length - 1]).code;
}

function redistributeCategories(entries, requiredDocuments, existingByCategory) {
  if (!requiredDocuments?.length) return entries;
  const counts = { ...existingByCategory };
  return entries.map((entry) => {
    const category = nextUnmetCategory(requiredDocuments, counts);
    counts[category] = (counts[category] || 0) + 1;
    return { ...entry, category };
  });
}

export default function DiagnosticReportUploadPanel({
  orderId,
  requiredDocuments = [],
  existingReports = [],
  disabled = false,
  onUploaded,
}) {
  const { t, tm } = useLanguage();
  const inputRef = useRef(null);
  const [selected, setSelected] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState([]);

  const existingByCategory = useMemo(() => {
    const counts = {};
    for (const report of existingReports || []) {
      const code = report.document_category || "GENERAL_REPORT";
      counts[code] = (counts[code] || 0) + 1;
    }
    return counts;
  }, [existingReports]);

  const selectedByCategory = useMemo(() => {
    const counts = {};
    for (const entry of selected) {
      counts[entry.category] = (counts[entry.category] || 0) + 1;
    }
    return counts;
  }, [selected]);

  const totalSize = useMemo(
    () => selected.reduce((sum, entry) => sum + (entry.file.size || 0), 0),
    [selected]
  );

  const missingRequirements = useMemo(() => {
    return (requiredDocuments || []).filter((doc) => {
      const have =
        (existingByCategory[doc.code] || 0)
        + (selectedByCategory[doc.code] || 0);
      return have < (doc.min_files || 1);
    });
  }, [requiredDocuments, existingByCategory, selectedByCategory]);

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    setError("");
    setMessage("");
    setFieldErrors([]);

    const next = [...selected];
    const localErrors = [];
    const seen = new Set(next.map((entry) => entry.key));
    let provisionalCounts = countByCategory(existingByCategory, next);

    for (const file of incoming) {
      const key = fileKey(file);
      if (seen.has(key)) {
        localErrors.push(`${file.name}: already selected`);
        continue;
      }
      const ext = extensionOf(file.name);
      if (!ALLOWED_EXT.has(ext)) {
        localErrors.push(`${file.name}: only PDF, JPG, or PNG`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        localErrors.push(`${file.name}: exceeds 10 MB`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        localErrors.push(`At most ${MAX_FILES} files per submission`);
        break;
      }
      const category = nextUnmetCategory(requiredDocuments, provisionalCounts);
      provisionalCounts[category] = (provisionalCounts[category] || 0) + 1;
      seen.add(key);
      next.push({ key, file, category });
    }

    setSelected(next);
    setFieldErrors(localErrors);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(key) {
    setSelected((prev) => prev.filter((entry) => entry.key !== key));
  }

  function setCategory(key, category) {
    setSelected((prev) =>
      prev.map((entry) => (entry.key === key ? { ...entry, category } : entry))
    );
    setFieldErrors([]);
    setError("");
  }

  function autoAssignCategories() {
    setSelected((prev) => redistributeCategories(prev, requiredDocuments, existingByCategory));
    setFieldErrors([]);
    setError("");
    setMessage(t("diagnostics.categoriesAutoAssigned"));
  }

  function validateBeforeSubmit() {
    const errors = [];
    if (!selected.length) {
      errors.push(t("diagnostics.selectFilesFirst"));
    }
    for (const requirement of missingRequirements) {
      errors.push(
        t("diagnostics.categoryNeedsFile", {
          label: requirement.label,
          count: requirement.min_files || 1,
        })
      );
    }
    if (missingRequirements.length && selected.length > 0) {
      errors.push(t("diagnostics.assignCategoriesHint"));
    }
    for (const entry of selected) {
      if (requiredDocuments?.length) {
        const allowed = requiredDocuments.some((doc) => doc.code === entry.category);
        if (!allowed) {
          errors.push(`${entry.file.name}: ${t("diagnostics.chooseRequiredCategory")}`);
        }
      }
    }
    return errors;
  }

  async function submitReports() {
    const validation = validateBeforeSubmit();
    if (validation.length) {
      setFieldErrors(validation);
      setError(validation[0]);
      return;
    }
    if (!orderId || uploading) return;

    setUploading(true);
    setProgress(5);
    setError("");
    setMessage("");
    setFieldErrors([]);

    try {
      const body = new FormData();
      const categories = [];
      for (const entry of selected) {
        body.append("reports", entry.file, entry.file.name);
        categories.push(entry.category);
      }
      body.append("document_categories", JSON.stringify(categories));

      const response = await api.post(`/diagnostics/orders/${orderId}/reports`, body, {
        timeout: 120000,
        onUploadProgress: (event) => {
          if (!event.total) return;
          const pct = Math.max(5, Math.min(95, Math.round((event.loaded / event.total) * 100)));
          setProgress(pct);
        },
      });

      setProgress(100);
      const data = response.data || {};
      if (data.partial || (data.failed || []).length) {
        const failedNames = (data.failed || [])
          .map((row) => `${row.filename}: ${row.message}`)
          .join("; ");
        setError(failedNames || data.message || "diagnostics.saveFailed");
        setMessage(data.message || "");
      } else if (data.requirements_met === false) {
        setMessage(data.message || t("diagnostics.reportsPartialRequirements"));
      } else {
        setMessage(data.message || t("diagnostics.reportUploaded"));
        setSelected([]);
      }

      if (typeof onUploaded === "function") {
        await onUploaded(data);
      }
    } catch (requestError) {
      const timedOut = requestError?.code === "ECONNABORTED"
        || /timeout/i.test(String(requestError?.message || ""));
      const serverMessage = requestError?.response?.data?.message;
      const serverCode = requestError?.response?.data?.code;
      if (timedOut) {
        setError("diagnostics.uploadTimedOut");
      } else if (serverMessage) {
        setError(serverMessage);
      } else if (serverCode) {
        setError(serverCode);
      } else {
        setError(apiMessage(requestError, "diagnostics.saveFailed"));
      }
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 600);
    }
  }

  return (
    <div className="diagnostics-multi-upload">
      {error && <Alert type="error">{tm(error)}</Alert>}
      {message && <Alert type="success">{tm(message)}</Alert>}

      {(requiredDocuments || []).length > 0 && (
        <div className="diagnostics-required-docs">
          <h3>{t("diagnostics.requiredDocuments")}</h3>
          <p className="mo-muted">{t("diagnostics.requiredDocumentsHint")}</p>
          <ul>
            {requiredDocuments.map((doc) => {
              const uploaded =
                (existingByCategory[doc.code] || 0)
                + (selectedByCategory[doc.code] || 0);
              const needed = doc.min_files || 1;
              const met = uploaded >= needed;
              return (
                <li key={doc.code} className={met ? "is-met" : "is-missing"}>
                  <strong>{doc.label}</strong>
                  <span>
                    {uploaded}/{needed}
                    {met ? ` · ${t("diagnostics.categoryReady")}` : ` · ${t("diagnostics.categoryMissing")}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <label className="diagnostics-upload diagnostics-upload-multi">
        <span>{t("diagnostics.uploadReportHint")}</span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          disabled={disabled || uploading}
          onChange={(event) => addFiles(event.target.files)}
        />
      </label>

      <div className="diagnostics-upload-toolbar">
        <p className="mo-muted diagnostics-upload-count">
          {t("diagnostics.selectedFileCount", { count: selected.length })}
          {selected.length > 0 ? ` · ${formatBytes(totalSize)}` : ""}
        </p>
        {selected.length > 0 && (requiredDocuments || []).length > 0 && (
          <Button
            type="button"
            variant="secondary"
            disabled={uploading}
            onClick={autoAssignCategories}
          >
            {t("diagnostics.autoAssignCategories")}
          </Button>
        )}
      </div>

      {fieldErrors.length > 0 && (
        <ul className="diagnostics-upload-errors">
          {fieldErrors.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      {selected.length > 0 && (
        <ul className="diagnostics-selected-files">
          {selected.map((entry) => {
            const label = (requiredDocuments || []).find((doc) => doc.code === entry.category)?.label
              || entry.category;
            return (
              <li key={entry.key}>
                <div className="diagnostics-selected-meta">
                  <FileUp size={16} aria-hidden="true" />
                  <div>
                    <strong>{entry.file.name}</strong>
                    <span>
                      {formatBytes(entry.file.size)} · {entry.file.type || extensionOf(entry.file.name)}
                    </span>
                  </div>
                </div>
                <label className="diagnostics-category-select">
                  <span>{t("diagnostics.documentCategory")}</span>
                  <select
                    value={entry.category}
                    disabled={uploading}
                    onChange={(event) => setCategory(entry.key, event.target.value)}
                    aria-label={`${t("diagnostics.documentCategory")}: ${entry.file.name}`}
                  >
                    {(requiredDocuments || []).length > 0 ? (
                      requiredDocuments.map((doc) => (
                        <option key={doc.code} value={doc.code}>{doc.label}</option>
                      ))
                    ) : (
                      <option value="GENERAL_REPORT">General report</option>
                    )}
                  </select>
                  <em className="diagnostics-category-current">{label}</em>
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={uploading}
                  onClick={() => removeFile(entry.key)}
                  aria-label={`Remove ${entry.file.name}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {uploading && (
        <div className="diagnostics-upload-progress" role="progressbar" aria-valuenow={progress}>
          <div style={{ width: `${progress}%` }} />
          <span>{progress}%</span>
        </div>
      )}

      <div className="diagnostics-actions">
        <Button
          type="button"
          disabled={disabled || uploading || selected.length === 0}
          onClick={submitReports}
        >
          <UploadCloud size={16} aria-hidden="true" />
          {uploading ? t("diagnostics.uploadingReports") : t("diagnostics.submitReports")}
        </Button>
      </div>
    </div>
  );
}
