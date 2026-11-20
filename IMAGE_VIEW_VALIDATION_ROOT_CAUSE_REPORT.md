# Image View Validation Root-Cause Report

## Executive finding

**Root cause:** the pre-upload “validation” flow checks image category and basic image quality, not whether a photo is actually the requested **Front**, **Left**, or **Right** view. The frontend calls this validator with the selected category and file but does not send the view. Neither backend validation layer accepts a view. Consequently, a response of `VALID` means “the image matched the selected category” (for example, MOUTH), not “this image satisfies the Front/Left/Right criteria.”

This is a validation-contract gap, not evidence that the three front-end photo slots share one result or that an API response cache is reusing results. The code keeps staged validation results under each slot. It does not currently return a slot identifier or a view-specific result, though, so the returned validation object itself is not independently attributable to a view.

## Frontend state and async behavior

Relevant implementation: [PhotoStep.jsx](./frontend/src/pages/healthWorker/screening/PhotoStep.jsx).

- `VIEWS` contains `FRONT_VIEW`, `LEFT_VIEW`, and `RIGHT_VIEW`.
- `selected` is one state object keyed by view; each `selected[view]` holds that slot’s `File`, category, and validation object. The `patchSelected(view, patch)` helper updates only that view.
- `validating` and `enhancing` are also objects keyed by view.
- There is a shared `analysisResult`, but it is for the later aggregate “analyze all saved photos” operation. It is not the pre-upload category validation result.
- `stageFile(view, file)` captures that slot’s `file` and the current shared category, and calls `runCategoryValidation(file, category)`. It assigns the response to `selected[view].validation`; the UI renders it inside that view’s card.
- A `stageToken.current[view]` token is checked after asynchronous work. Replacing/clearing a photo invalidates the slot token, so a stale response for the same slot is ignored. Separate slot keys prevent a Front request from overwriting Left or Right validation state.
- The generic `error` message is shared across cards, so concurrent failures can replace the banner text, but that does not merge or replace the per-slot validation objects.

**State conclusion:** the validation state is not one shared result reused for all three slots. It is stored by slot in `selected`; however, the validation payload has no explicit `slot_id`, `expected_view`, or view-validation fields. Its association to a slot exists only in the enclosing frontend object.

## API request and response reuse

Frontend request path:

1. `stageFile(view, file)` retains the actual selected `File`.
2. `runCategoryValidation(file, category)` appends `category` and that `file` as `photo` to a new `FormData`, then sends a POST to `/screenings/:id/photos/validate`.
3. This request does **not** append `view` or a slot identifier.
4. Saving later sends another multipart request containing `view`, `category`, and the original file.

The axios client creates ordinary requests and has no response cache/interceptor: [api.js](./frontend/src/services/api.js). The PWA service worker’s existing policy bypasses `/api/` requests and does not cache private API responses: [service-worker.js](./frontend/public/service-worker.js).

On the server, Multer uses in-memory single-file uploads. The controller passes `req.file` and `req.body.category` to `screeningService.validatePhoto`; it does not pass a view. The service validates access, screening state, and image consent, then passes that uploaded file to the category validator. The backend category service forwards `file.buffer` and the category to the AI pipeline. This traces the request’s actual image bytes; no code-level substitution of one slot’s file for another was found.

**Caching conclusion:** no application response cache or PWA API cache/reuse path was found. The validation endpoint is a POST and the client creates a new `FormData` for each call. The JSON validation controller does not explicitly set `Cache-Control: no-store`; adding that header would be prudent privacy hardening, but the inspected code does not show a cached response causing the three results to match.

## Backend validation flow

1. [screenings.js](./backend/routes/screenings.js) registers `POST /:id/photos/validate` with authentication, Health Worker role, `image.upload` permission, and `singlePhoto` Multer middleware.
2. [screeningController.js](./backend/controllers/screeningController.js) calls `screeningService.validatePhoto(userId, screeningId, category, req.file)`. There is no view argument.
3. [screeningService.js](./backend/services/screeningService.js) calls `imageCategoryValidationService.validateScreeningImage(file, category)`. For actual photo saving, `uploadPhoto` receives and validates the view, but independently re-runs the same category-only check; the view is used to store the photo slot, not by the suitability validator.
4. [imageCategoryValidationService.js](./backend/services/imageCategoryValidationService.js) sends only `file` and `category` to the Python endpoint. Its response mapping contains category fields and status, not a view result.
5. Backend upload authorization requires a `VALID` category result. Category mismatch, poor quality, and pipeline failures do not get silently converted into a successful category match.

The validator’s statuses/reasons therefore describe category suitability, image quality, or category-classifier availability. They are not reasons for rejecting an image that was captured in the wrong view.

## AI validation and actual view-classification capability

The Python endpoint is `/api/validate-screening-image` in [main.py](./aipipe/aipipe/main.py). It accepts `file` and `category`; its description and implementation are category-suitability validation. The `GemmaCategoryClassifier` in [image_category_validation.py](./aipipe/aipipe/image_category_validation.py) receives image bytes plus a category and is prompted to return only `detected_category`, confidence, and a short reason. The MOUTH criterion asks for an open mouth/oral cavity and rejects unrelated categories. There is no view input, `detected_view` output, or Front/Left/Right criterion.

There is a separate, later analysis path:

- [aiAnalysisService.js](./backend/services/aiAnalysisService.js) loads the three persisted photos by their stored view, downloads each private original, and sends distinct multipart fields named `front`, `left`, and `right`.
- [main.py](./aipipe/aipipe/main.py) maps those fields to the corresponding expected view and invokes the analysis once per view.
- [oral_analysis.py](./aipipe/aipipe/oral_analysis.py) includes text such as “Visible photo view: front” in the analysis prompt. However, the required model JSON has no detected-view field or view-match decision. `validate_ai_result` assigns `"view": view` from the caller’s expected slot; this is an echoed association, not a model-detected view. This analysis path also does not gate photo upload on a view match.

The default model identifier is Cloudflare `@cf/meta/llama-3.2-11b-vision-instruct`, and the client sends image bytes to a vision endpoint. `CLOUDFLARE_AI_MODEL` can override that default. The project marks model information as `trained_oral_model: false` and `validation_status: NOT_VALIDATED`. The code establishes multimodal image prompting, but it does **not** establish or test reliable Front/Left/Right classification. No claim that this model can reliably distinguish those views is supported by the implementation.

**MOUTH is not proof of view:** MOUTH detection can confirm that an image appears to contain the selected anatomical category. It cannot prove that the image is specifically the Front, Left, or Right view.

## Evidence from tests and logs

- [ScreeningWizard.test.jsx](./frontend/src/pages/healthWorker/screening/ScreeningWizard.test.jsx) checks that selecting all three photos causes three validation and three enhancement-preview requests. Its `api.post` mock returns the same `state.validation` shape for every validation call and does not inspect the uploaded file contents, category, or view. The test verifies saved uploads carry three view values, but does not test view-specific preflight validation.
- [screeningRoutes.test.js](./backend/tests/unit/screeningRoutes.test.js) posts category and photo to the validation route without a view; it includes a view only on the later upload request.
- [test_image_category_validation.py](./aipipe/aipipe/tests/test_image_category_validation.py) exercises category validation and classifier responses without a view field.
- [aipipe_test_out.txt](./aipipe_test_out.txt) contains test-server endpoint status lines and a simulated classifier payment-required failure. These are test logs, not evidence of a production Front/Left/Right misclassification; they contain no per-image slot, digest, or detected-view information.
- No request-level logging was found that records a safe per-request image digest, requested slot, or view-validation output. The available evidence supports a missing view-validation feature, but cannot identify which historical client image produced any particular observed result.

## Additional related finding

The category selector in `PhotoStep` is shared across the three cards, but each staged/saved photo records the category selected when it was processed. If saved photos have different categories, `sendScreeningForAnalysis` selects `categories[0]` and sends that one category for all three analysis images. This is separate from view validation, but could mislabel per-image analysis if category is changed between captures.

## Recommended minimal fix

1. **Make the validation contract slot-aware:** include the slot (`FRONT_VIEW`, `LEFT_VIEW`, or `RIGHT_VIEW`) in the preflight request and carry it through the backend response. Return a result with explicit `slot_id`, `expected_view`, `detected_category`, category status/reason, and separate `detected_view`, view status, and view rejection reason. Keep results isolated by slot in the frontend.
2. **Do not treat category as view validation:** implement a distinct view check and require both category suitability and the view policy to pass before marking the slot valid. Preserve the actual rejection reason. Revalidate the same conditions at upload time using the upload’s view.
3. **Do not assume the current model is reliable for view classification:** first evaluate the configured vision model against representative, correctly labeled Front/Left/Right images, including incorrect-view and uncertain cases. Until it is validated, return a non-passing/needs-review view status rather than claiming the view passed.
4. **Strengthen regression tests:** assert each request carries a distinct file and expected view, return deliberately different results, and resolve concurrent responses out of order. Also test same-slot replacement/stale response behavior and that category match alone does not pass the view check.
5. **Keep the separate multi-photo AI analysis category aligned per image** if different categories are supported; do not silently apply the first photo’s category to all views. Consider `Cache-Control: no-store` on validation responses as additional hardening.

## Scope and implementation status

This phase was investigation-only. No frontend, backend, AI prompt, database, or validation code was changed. Only this report was created. Implementation awaits approval.
