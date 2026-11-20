# Flexible Image Oral Screening Report Implementation

## Existing architecture inspected

- The Health Worker flow is implemented by `ScreeningWizard` and `PhotoStep`. Photos are stored through the existing screening API and AI analysis is requested for the active screening.
- `backend/services/aiAnalysisService.js` loads private original photos, records their per-photo category, calls the AI pipeline, validates view-to-photo mapping, and stores each attempt in the existing assessment and audit tables.
- The authenticated FastAPI endpoint in `aipipe/aipipe/main.py` preprocesses each supplied image and calls the existing vision model independently for its view and category. Structured oral findings and response validation are in `aipipe/aipipe/oral_analysis.py`.
- Medical Officer case data is served by `reviewService`; original image bytes are fetched through the existing consent- and claim-guarded image route. The report is shown in the existing case summary.
- The model metadata identifies the configured model as not trained specifically for oral screening and not clinically validated. Results remain advisory and require clinician review.

## Files changed

- `aipipe/aipipe/main.py`
- `aipipe/aipipe/oral_analysis.py`
- `aipipe/aipipe/tests/test_oral_analysis.py`
- `backend/services/aiAnalysisService.js`
- `backend/services/medicalOfficer/imageService.js`
- `backend/services/medicalOfficer/reviewService.js`
- `backend/services/screeningService.js`
- `backend/tests/api/syntheticAiScreeningWorkflow.test.js`
- `backend/tests/unit/aiAnalysisService.test.js`
- `backend/tests/unit/screeningService.test.js`
- `frontend/src/components/OralScreeningReport.jsx`
- `frontend/src/components/OralScreeningReport.css`
- `frontend/src/components/oralScreeningReportUtils.js`
- `frontend/src/components/oralScreeningReport.test.js`
- `frontend/src/i18n/translations.js`
- `frontend/src/pages/careTeam/SpecialistDashboard.jsx`
- `frontend/src/pages/healthWorker/screening/PhotoStep.jsx`
- `frontend/src/pages/healthWorker/screening/ScreeningWizard.jsx`
- `frontend/src/pages/healthWorker/screening/ScreeningWizard.test.jsx`
- `frontend/src/pages/medicalOfficer/CaseSummary.jsx`
- `frontend/src/pages/medicalOfficer/ImageReview.jsx`

## API and database changes

- The existing `/api/analyze-screening` multipart endpoint accepts any one, two, or three of `front`, `left`, and `right`; it rejects a request only when no image is supplied. Optional per-view categories are passed separately.
- Only uploaded originals are sent for analysis. Each returned result is validated against its uploaded view, screening ID, and photo category. An invalid or failed image receives a failed/unusable result; it is not given copied findings or a successful result label. The Health Worker can retry analysis.
- The existing submit and requested-information flows no longer require all three views.
- No database schema, constraint, or migration was added. Existing photo, assessment, assessment-log, and audit records are reused. Failed per-image attempts are stored with a failed status and no result label; new assessment rows continue to leave the score column `NULL`.
- Score and confidence fields, including nested image-quality score reports, are removed from the backend result used by the app and from persisted `analysis_details`. Image-quality presentation is categorical.

## Classification and report behavior

- `SUSPICIOUS`: at least one uploaded image has an adequately assessable, potentially concerning finding.
- `NO SUSPICIOUS FINDING`: every uploaded image is adequately assessed and no potentially concerning finding is reported.
- `INCONCLUSIVE`: an uploaded image failed, could not be assessed, or did not meet the assessment requirements.
- A missing view does not block analysis or change the classification. It is explicitly shown as “Image not provided — No assessment available.”
- The report shows date, categories, uploaded and analyzed image counts, missing views, overall summary, per-image previews and textual finding states, important findings, interpretation, recommended next steps, Medical Officer review status, and a single non-diagnostic disclaimer. Poor-quality images not sent to the model are excluded from the analyzed count.
- Existing Medical Officer image review and Specialist result views no longer present artificial confidence/health scores. No cancer diagnosis or cancer probability is generated.

## Test results

| Validation | Result |
|---|---|
| Frontend screening/report tests (`ScreeningWizard.test.jsx`, `oralScreeningReport.test.js`) | Passed: 25 tests |
| Backend affected tests (`aiAnalysisService`, `screeningService`, synthetic workflow) | Passed: 103 tests |
| Python AI pipeline tests | Passed: 69 tests |
| Frontend production build | Passed; build emitted existing warnings listed below |
| Full backend suite | 74 passed, 3 failed in unrelated `realEsrgan`, specialist-availability date, and private-image-storage timeout tests |
| Full frontend suite | Not completed; the broad run encountered unrelated auth-mock and Care Team timeout failures. The focused screening/report suites passed. |

Build warnings remaining: duplicate `clinicalReason` translation keys and a missing hook dependency in `DiagnosticOrderDetails.jsx`. No warning remains in the changed screening/report files.

Tests use synthetic images and mocked model responses. A live provider call, Android Chrome, installed-PWA, tablet, and desktop end-to-end workflows were not exercised.

## Remaining limitations

- The repository does not establish that the configured general vision model reliably classifies oral findings. Its metadata explicitly reports that it is not an oral-trained, clinically validated model. Findings must not be interpreted as confirming or ruling out cancer.
- Image preprocessing normalizes each uploaded image before model inference; the original stored photo is retained unchanged. Provider behavior and clinical performance still require independent validation.
- The broad frontend suite and three unrelated backend tests remain unresolved; they were not attributed to this implementation.
