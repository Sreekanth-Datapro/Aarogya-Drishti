# Duplicate Photo Checksum Root-Cause Report

## Executive conclusion

The checked-in schema **and the live database catalog** scope photo checksum uniqueness to the current screening:

```sql
UNIQUE (screening_id, checksum_sha256)
```

Therefore, an image uploaded for a different screening—even for a different patient—cannot by itself violate this constraint, assuming the current request targets the correct screening ID.

The frontend has a concrete stale-screening race: rapid patient selections can resolve out of order, and the older response unconditionally replaces the `screening` state while leaving the newer `patient` state selected. The photo uploader then sends `screening.id`. This could send an image to a prior patient's screening, where its checksum may already exist. The PhotoStep is also not keyed by screening ID, so staged per-view files can remain mounted if the screening prop changes while the wizard stays on the photo step.

The upload service additionally maps **every PostgreSQL unique-violation error** (`23505`) from its transaction to the same `DUPLICATE_PHOTO` response. It does not check or return the violated constraint name. The response consequently confirms that the service caught a unique violation, but does not prove that the checksum constraint was the one that failed. The stale-screening race is a plausible explanation for the reported situation, but the specific request's target cannot be confirmed without comparing its URL screening ID with the ID loaded for the currently selected patient. No patient/photo records were queried for that comparison.

No browser/API cache path for screening IDs was found in the inspected wizard flow: [api.js](./frontend/src/services/api.js) uses ordinary Axios requests and stores session/auth data, not screening IDs; the service worker [service-worker.js](./frontend/public/service-worker.js) does not intercept non-GET requests and bypasses `/api/` GET requests. The stale ID risk is in in-memory React state and asynchronous selection handling, not a cached API response.

No patient/photo rows were queried for this investigation. Only schema metadata was read from the live database.

## 1. Checksum generation and normalization

Implementation: [screeningService.js](./backend/services/screeningService.js).

1. `uploadPhoto` receives the original multipart `photo` file and checks the file type and size.
2. `cleanImage(file.buffer)` uses `sharp` to read image metadata, applies EXIF orientation with `.rotate()`, and re-encodes in the original detected format with `.toFormat(info.format)`. This also strips metadata as described in the function comment.
3. The service hashes the cleaned output bytes, not the original multipart bytes:

   ```js
   const checksum = crypto.createHash("sha256").update(image.data).digest("hex");
   ```

4. It inserts that checksum into `tbl_screening_photos.checksum_sha256`.

The cleanup can make two **different input files** hash identically if they normalize to exactly the same encoded output—for example, if their only differences are metadata that is removed and their decoded image data and encoding parameters otherwise normalize identically. It does not intentionally make different image content identical. A practical SHA-256 collision between different normalized output bytes is not a credible explanation. The code alone cannot establish that two user-selected images yield different normalized bytes; no image files were inspected or compared for this report.

## 2–3. Duplicate scope and exact database constraint

The repository schema definitions include the following constraint:

```sql
ALTER TABLE ONLY public.tbl_screening_photos
    ADD CONSTRAINT tbl_screening_photos_screening_id_checksum_sha256_key
    UNIQUE (screening_id, checksum_sha256);
```

This exact named constraint appears in:

- [AAROGYA_LOCAL_SCHEMA.sql](./backend/AAROGYA_LOCAL_SCHEMA.sql)
- [_schema_only.sql](./backend/schema/_schema_only.sql)
- [AAROGYA_BOOTSTRAP_FINAL.sql](./backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql)
- `backend/ALL_IN_ONE (1).sql`, whose table definition has `UNIQUE (screening_id, checksum_sha256)`.

The live database catalog was checked read-only using `pg_constraint` and `pg_indexes` for `public.tbl_screening_photos`. It returned:

```text
tbl_screening_photos_screening_id_checksum_sha256_key
UNIQUE (screening_id, checksum_sha256)

tbl_screening_photos_screening_id_checksum_sha256_key
CREATE UNIQUE INDEX ... (screening_id, checksum_sha256)
```

The live catalog did **not** show a global `UNIQUE (checksum_sha256)` or patient-scoped `UNIQUE (patient_id, checksum_sha256)` index. Other unique constraints on this table cover the row ID, `(id, screening_id)`, private storage key, and `(captured_by, idempotency_key)`; the upload insert does not set an idempotency key.

| Candidate scope | Enforced by live checksum index? | Can a prior screening block this upload? |
|---|---:|---|
| Current screening ID + checksum | Yes | Yes, if the normalized checksum is already on this screening |
| Patient ID + checksum | No | Not by itself |
| Global checksum across all screenings | No | No |

The table also has a composite foreign key from `(screening_id, patient_id)` to the screening row. This ties a photo to the patient who owns that screening; it does not broaden checksum uniqueness across patients.

The live database reported these unique constraints for `public.tbl_screening_photos`:

| Constraint | Definition |
|---|---|
| `tbl_screening_photos_pkey` | `PRIMARY KEY (id)` |
| `tbl_screening_photos_id_screening_id_key` | `UNIQUE (id, screening_id)` |
| `tbl_screening_photos_private_key_key` | `UNIQUE (private_key)` |
| `tbl_screening_photos_screening_id_checksum_sha256_key` | `UNIQUE (screening_id, checksum_sha256)` |
| `tbl_screening_photos_captured_by_idempotency_key_key` | `UNIQUE (captured_by, idempotency_key)` |

The `idx_photos_screening` index is non-unique. The upload insert supplies a generated photo ID and private key, and does not provide `idempotency_key`; the checksum key is the intended duplicate guard.

## 4. Can a previous patient's image block this patient's different screening?

**Not under the live constraint.** Because `screening_id` is part of the unique key, the same checksum on another screening is a different key and is permitted. The prior patient's upload cannot explain the conflict solely by reusing the same image bytes.

If the checksum constraint caused the current error, then the matching checksum is already present for the screening ID in the current request. The row may be active or superseded: the unique key is not a partial index, and the upload flow marks an existing same-view row `SUPERSEDED` without deleting it. A superseded row therefore still participates in checksum uniqueness.

However, the frontend can send a prior screening ID because of the patient-selection race described below. In that case the database sees the correct duplicate for the screening ID it received, even though the Health Worker believes they selected a different patient.

## Frontend-to-backend screening ID trace

1. [ScreeningWizard.jsx](./frontend/src/pages/healthWorker/screening/ScreeningWizard.jsx) stores `patient` and `screening` as separate React state values.
2. [PatientStep.jsx](./frontend/src/pages/healthWorker/screening/PatientStep.jsx) renders patient buttons and calls `onChoose(patient)`; it does not disable those buttons while a screening lookup is pending.
3. `choosePatient(item)` in `ScreeningWizard.jsx` calls `setPatient(item)`, clears `screening`, and, for an open screening, calls `loadScreening(item.screening_id)`.
4. `loadScreening(screeningId)` fetches `GET /screenings/${screeningId}` and unconditionally calls `setScreening(current)`. The manual `choosePatient` flow has no request token/cancellation or check that the response still corresponds to the latest selected patient. Its `setPatient` callback only updates the patient if the response patient matches the current patient, so an older response can set the screening while leaving the newer patient selected.
5. [PhotoStep.jsx](./frontend/src/pages/healthWorker/screening/PhotoStep.jsx) gets the screening object as a prop, constructs `POST /screenings/${screening.id}/photos`, and appends the chosen view, category, and that view's staged file.
6. [screenings.js](./backend/routes/screenings.js) binds `:id` to the upload controller. [screeningController.js](./backend/controllers/screeningController.js) forwards `req.params.id` directly to `screeningService.uploadPhoto`.
7. `requireOwnScreening` in [screeningService.js](./backend/services/screeningService.js) verifies the screening belongs to the authenticated Health Worker and checks access to its patient. It cannot verify the UI's current patient selection because the upload contract supplies no independently checked expected patient ID.

**Conclusion:** under normal sequential selection, the upload URL uses the currently loaded screening ID. Under overlapping patient selections, the code can use a stale `screening.id`; therefore the current patient's ID is not guaranteed in every race. This is React state reuse, not an API response cache. The existing tests do not cover rapid, out-of-order patient selections.

## 5. Error mapping and what the response proves

In `uploadPhoto`, the database insert runs in a transaction. The catch block currently does this:

```js
if (error.code === "23505") {
  throw new HttpError(
    409,
    "This photo was already uploaded for this screening",
    "DUPLICATE_PHOTO"
  );
}
```

This mapping does not inspect PostgreSQL's `error.constraint`. As a result:

- A duplicate `(screening_id, checksum_sha256)` correctly becomes `DUPLICATE_PHOTO`.
- Any other unique violation from this transaction is also reported as `DUPLICATE_PHOTO`, even if it is not a duplicate checksum.

The browser response `code: "DUPLICATE_PHOTO"` is therefore not enough to distinguish these causes. The response includes a request ID, but the current 409 path does not log the underlying PostgreSQL constraint name for correlation.

Because the only code path that returns `DUPLICATE_PHOTO` checks `error.code === "23505"`, the caught PostgreSQL SQLSTATE is known to have been `23505` (unique violation). For a genuine checksum violation, the expected exact database constraint is:

```text
SQLSTATE: 23505
Constraint: tbl_screening_photos_screening_id_checksum_sha256_key
Definition: UNIQUE (screening_id, checksum_sha256)
```

The actual constraint name for the reported request cannot be determined from the response. The service discards it when translating the exception, and [errorMiddleware.js](./backend/middleware/errorMiddleware.js) logs only errors with HTTP status 500 or higher; the translated duplicate is HTTP 409. Thus no server log produced by this path establishes the original constraint name. The list above is the complete set of live unique constraints on `tbl_screening_photos`; because the catch surrounds a transaction that also writes other tables, another table's unique constraint could also be mapped to this response.

## 6. Front, Left, and Right handling

- [PhotoStep.jsx](./frontend/src/pages/healthWorker/screening/PhotoStep.jsx) defines the three views separately and stores staged files under `selected[view]`.
- Its upload function reads `selected[view].file` and sends that file with `view` in multipart form data.
- [screenings.js](./backend/routes/screenings.js) routes each upload to the same `uploadPhoto` service. The service stores the requested view in `annotation_site`.
- `savePhotos` uploads requested views sequentially, and the backend insert is per photo.

Thus Front, Left, and Right are independently staged and uploaded. However, the duplicate key does **not** include the view: reusing the same normalized image bytes for two view slots of the same screening is blocked intentionally. Three different normalized image outputs on the same screening should not conflict with one another.

## Root-cause assessment

The code/schema do not support a global cross-patient checksum conflict. The most likely explanations consistent with the observed response are:

1. A patient-selection race caused the request to use the previous screening ID, where the image was already present; or
2. The normalized checksum already exists on the correctly selected current screening (possibly from an earlier attempt, or in a superseded row); or
3. A different unique constraint failed and the generic catch block mislabeled it as `DUPLICATE_PHOTO`.

The available response does not identify which case occurred. No current-screening photo rows or patient data were read, so this report does not assert which row or constraint caused the specific request's failure.

## Smallest safe fix recommendation

Preserve the unique checksum protection. The smallest safe correction is to address both the identified stale-ID path and ambiguous error reporting:

1. Add a monotonically increasing selection-request token (or equivalent cancellation/guard) to `choosePatient`/`loadScreening`, and apply `screening`, `patient`, `consents`, and `step` updates only for the latest selection. Disable patient selection while a selection is in flight as an additional UI guard.
2. Key `PhotoStep` by `screening.id` so staged files and validation state are reset if its screening changes.
3. Translate `23505` to `DUPLICATE_PHOTO` only when `error.constraint` equals `tbl_screening_photos_screening_id_checksum_sha256_key`. For other unique violations, preserve normal internal-error handling and record safe diagnostics containing the request ID and constraint name—not image bytes, patient identifiers, or checksum values.
4. Add a `ScreeningWizard` regression test that starts two patient-screening lookups, resolves the earlier selection last, and verifies that the newer patient and screening remain paired and that a photo upload uses that screening ID.

Do not broaden or remove the checksum constraint. It already permits the same image in different screenings and blocks duplicates within one screening.

No database or application changes were made. This report is investigation-only.
