
import os
import logging
import ipaddress
import secrets
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from cloudflare_vision import CloudflareWorkersAIClient, DEFAULT_MODEL
from oral_analysis import (
    CLINICAL_SCORE_UNAVAILABLE,
    CLINICIAN_REVIEW_RECOMMENDATION,
    INSUFFICIENT_IMAGE_QUALITY,
    MAX_IMAGE_BYTES,
    GemmaCloudVision,
    InvalidImageError,
    OralVisionModel,
    build_criterion_scores,
    calibrate_observation_confidence,
    compute_visual_health_assessment_score,
    VISUAL_HEALTH_SCORE_UNAVAILABLE,
    compute_image_quality_score,
    extract_json_response as _extract_json_response,
    prepare_image,
    validate_ai_result as _validate_ai_result,
)
from image_category_validation import (
    GemmaCategoryClassifier,
    IMAGE_CATEGORIES,
    normalize_category,
    validate_screening_image,
)


# ==================================================
# 1. CONFIGURATION
# ==================================================

load_dotenv()

CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_AUTH_TOKEN = os.getenv("CLOUDFLARE_AUTH_TOKEN", "")
AI_PIPELINE_AUTH_TOKEN = os.getenv("AI_PIPELINE_AUTH_TOKEN", "")
MODEL = os.getenv("CLOUDFLARE_AI_MODEL", DEFAULT_MODEL)
CLOUDFLARE_TIMEOUT_SECONDS = float(os.getenv("CLOUDFLARE_AI_TIMEOUT_SECONDS", "120"))
# Kept for older log helpers that redacted the previous provider key name.
API_KEY = CLOUDFLARE_AUTH_TOKEN
SCREENING_ANALYSIS_VIEWS = ("FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW")

if not CLOUDFLARE_ACCOUNT_ID or not CLOUDFLARE_AUTH_TOKEN:
    raise RuntimeError(
        "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AUTH_TOKEN must be set in the .env file"
    )


# ==================================================
# 2. LOGGING
# ==================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)

logger = logging.getLogger("oral-image-api")


# ==================================================
# 3. CLOUDFLARE WORKERS AI CLIENT
# ==================================================

client = CloudflareWorkersAIClient(
    account_id=CLOUDFLARE_ACCOUNT_ID,
    api_token=CLOUDFLARE_AUTH_TOKEN,
    model=MODEL,
    timeout_seconds=CLOUDFLARE_TIMEOUT_SECONDS,
)
vision_model: OralVisionModel = GemmaCloudVision(client, MODEL)
category_classifier = GemmaCategoryClassifier(client, MODEL)


# ==================================================
# 4. FASTAPI APPLICATION
# ==================================================

app = FastAPI(
    title="Oral Image Analysis API",
    description="AI-assisted oral cavity image screening using Gemma Cloud",
    version="1.2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)


extract_json_response = _extract_json_response
validate_ai_result = _validate_ai_result


# ==================================================
# 8. ROOT ENDPOINT
# ==================================================

@app.get("/")
async def root():
    return {
        "status": "success",
        "message": "Oral Image Analysis API is running",
        "model": MODEL,
        "version": "1.2.0",
    }


# ==================================================
# 9. HEALTH CHECK
# ==================================================

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "model": MODEL,
        "model_information": vision_model.get_model_information(),
        "service": "oral-image-analysis",
    }


# ==================================================
# 10. ORAL IMAGE ANALYSIS ENDPOINT
# ==================================================

def is_loopback_request(request: Request) -> bool:
    """Informational only — authentication never trusts client IP or forwarded headers."""
    if not request.client:
        return False
    try:
        return ipaddress.ip_address(request.client.host).is_loopback
    except ValueError:
        return False


def extract_bearer_token(authorization_header: str | None) -> str | None:
    if not authorization_header:
        return None
    scheme, separator, supplied_token = authorization_header.partition(" ")
    if separator != " " or scheme.lower() != "bearer" or not supplied_token:
        return None
    return supplied_token


def is_internal_ai_request(request: Request) -> bool:
    """
    Service-to-service auth for Docker/Render private networking.

    Requires AI_PIPELINE_AUTH_TOKEN (≥32 chars) via Authorization: Bearer.
    Does not use loopback checks and does not trust X-Forwarded-For / X-Real-IP.
    """
    if len(AI_PIPELINE_AUTH_TOKEN) < 32:
        return False
    supplied_token = extract_bearer_token(request.headers.get("authorization"))
    if supplied_token is None:
        return False
    # Constant-time compare; lengths must match or compare_digest raises.
    expected = AI_PIPELINE_AUTH_TOKEN.encode("utf-8")
    provided = supplied_token.encode("utf-8")
    if len(provided) != len(expected):
        return False
    return secrets.compare_digest(provided, expected)


def require_internal_ai_request(request: Request) -> None:
    if not is_internal_ai_request(request):
        raise HTTPException(
            status_code=403,
            detail="Screening analysis is available only through the authenticated application.",
        )


async def prepare_upload(file: UploadFile) -> tuple[bytes, dict]:
    image_bytes = await file.read(MAX_IMAGE_BYTES + 1)
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Maximum image size is 10 MB.")
    try:
        image_data, _, quality = prepare_image(image_bytes, file.content_type or "")
    except InvalidImageError as error:
        status = 413 if "10 MB" in str(error) else 400
        raise HTTPException(status_code=status, detail=str(error)) from error
    return image_data, quality


def build_view_result(
    view: str,
    screening_reference: str | None,
    quality: dict,
    model_result: dict | None,
    *,
    selected_category: str = "MOUTH",
    model_output_invalid: bool = False,
) -> dict:
    quality_report = quality.get("score_report") or compute_image_quality_score(quality)
    warnings = ["IMAGE_QUALITY_NEEDS_REVIEW"] if quality["warnings"] else []
    inference_performed = model_result is not None or model_output_invalid
    quality_insufficient = quality_report.get("status") == "INSUFFICIENT"

    if model_output_invalid:
        classification = "UNCERTAIN"
        raw_confidence = None
        observations = ["The AI model's answer for this view could not be used, so no automated observation is available."]
        abnormalities = []
        model_image_quality = "UNKNOWN"
        model_status = "INVALID_OUTPUT"
        findings = []
        not_assessable_reason = "The AI model's answer for this view could not be used."
        warnings.extend(["MODEL_RESPONSE_INVALID", "CLINICIAN_REVIEW_REQUIRED"])
        usable_model = False
    elif model_result is None or quality_insufficient:
        classification = "UNCERTAIN"
        raw_confidence = None
        observations = [
            INSUFFICIENT_IMAGE_QUALITY
            if quality_insufficient
            else "Automated visual analysis was not performed because the image quality check needs review."
        ]
        abnormalities = []
        model_image_quality = "POOR"
        model_status = "NOT_ASSESSABLE"
        findings = []
        not_assessable_reason = (
            quality_report.get("label")
            or "Image quality check needs review before visual analysis."
        )
        warnings.append("CLINICIAN_REVIEW_REQUIRED")
        if "IMAGE_QUALITY_NEEDS_REVIEW" not in warnings:
            warnings.insert(0, "IMAGE_QUALITY_NEEDS_REVIEW")
        usable_model = False
    else:
        classification = model_result["classification"]
        raw_confidence = model_result["confidence"]
        observations = model_result["observations"]
        abnormalities = model_result["abnormalities"]
        model_image_quality = model_result["image_quality"]
        model_status = model_result.get("model_status") or ("NOT_ASSESSABLE" if classification == "UNCERTAIN" else "OK")
        findings = model_result.get("possible_visual_findings") or []
        not_assessable_reason = model_result.get("not_assessable_reason")
        selected_category = model_result.get("selected_category") or selected_category
        if classification == "UNCERTAIN":
            warnings.append("MODEL_RESULT_UNCERTAIN")
        usable_model = True

    confidence = calibrate_observation_confidence(
        raw_confidence,
        quality_report,
        model_status,
        findings,
    )
    criterion_scores = build_criterion_scores(findings)

    # Prefer score already computed from model-returned findings (pre-pad) in validate_ai_result.
    if usable_model and model_result and "visual_health_assessment_score" in model_result:
        visual_score = {
            "visual_health_assessment_score": model_result.get("visual_health_assessment_score"),
            "visual_health_assessment_score_message": model_result.get(
                "visual_health_assessment_score_message"
            ) or VISUAL_HEALTH_SCORE_UNAVAILABLE,
            "visual_health_assessment_score_reasons": model_result.get(
                "visual_health_assessment_score_reasons"
            ) or [],
            "visual_health_assessment_unassessable": model_result.get(
                "visual_health_assessment_unassessable"
            ) or [],
        }
    else:
        visual_score = compute_visual_health_assessment_score(
            findings if usable_model else [],
            model_status=model_status if usable_model else "NOT_ASSESSABLE",
        )

    visual_score_value = visual_score["visual_health_assessment_score"]
    if visual_score_value is not None:
        if not isinstance(visual_score_value, int) or not 0 <= visual_score_value <= 100:
            visual_score = compute_visual_health_assessment_score(
                [],
                model_status="NOT_ASSESSABLE",
            )

    return {
        "view": view,
        "selected_category": selected_category,
        "screening_reference": screening_reference,
        "classification": classification,
        "model_status": model_status,
        "model_confidence": confidence,
        "observation_confidence": confidence,
        "raw_model_confidence": raw_confidence,
        "confidence_meaning": (
            "Calibrated observation confidence only; capped by technical image quality. "
            "It is not a disease probability, severity score, or overall clinical screening score."
        ),
        "possible_visual_findings": findings,
        "criterion_scores": criterion_scores,
        "image_quality_score": quality_report,
        "overall_clinical_score": None,
        "overall_clinical_score_message": CLINICAL_SCORE_UNAVAILABLE,
        **visual_score,
        "not_assessable_reason": not_assessable_reason,
        "observations": observations,
        "abnormalities": abnormalities,
        "recommendation": CLINICIAN_REVIEW_RECOMMENDATION,
        "image_quality": {
            **{key: value for key, value in quality.items() if key != "score_report"},
            "model_assessment": model_image_quality,
            "score_report": quality_report,
        },
        "model_information": {
            **vision_model.get_model_information(),
            "inference_performed": inference_performed,
            "model_output_usable": usable_model and confidence is not None,
        },
        "uncertainty_warnings": warnings,
        "review_status": "PENDING_MEDICAL_OFFICER_REVIEW",
    }


def describe_model_error(error: Exception) -> str:
    """Error type, HTTP status and a short message for the log; the API key is never included."""
    status = getattr(error, "status_code", None)
    message = " ".join(str(error).split())[:200]
    if API_KEY:
        message = message.replace(API_KEY, "***")
    parts = [type(error).__name__]
    if status:
        parts.append(f"status={status}")
    if message:
        parts.append(message)
    return " | ".join(parts)


def model_failure_response(error: Exception) -> tuple[int, str]:
    status = getattr(error, "status_code", None)
    if "timeout" in type(error).__name__.lower():
        return 504, "Vision model request timed out."
    if status in (401, 403):
        return 502, "The vision model rejected the configured API key."
    if status == 429:
        return 503, "The vision model rate limit was reached. Try again later."
    return 502, "Vision model is temporarily unavailable."


async def analyze_uploaded_image(
    file: UploadFile,
    view: str,
    screening_reference: str | None,
    *,
    selected_category: str = "MOUTH",
    skip_model_on_quality_warning: bool,
    tolerate_invalid_model_output: bool = False,
) -> tuple[dict, dict]:
    image_data, quality = await prepare_upload(file)
    model_result = None
    model_output_invalid = False
    if not (skip_model_on_quality_warning and quality["warnings"]):
        try:
            model_result = await vision_model.analyze(image_data, view, selected_category)
        except ValueError as error:
            logger.warning("Vision model answer for %s could not be used: %s", view, error)
            if not tolerate_invalid_model_output:
                raise HTTPException(status_code=502, detail="The vision model returned an invalid response.") from error
            model_output_invalid = True
        except Exception as error:
            logger.error("Vision model request failed for %s (%s)", view, describe_model_error(error))
            status, message = model_failure_response(error)
            raise HTTPException(status_code=status, detail=message) from error

    structured_result = build_view_result(
        view,
        screening_reference,
        quality,
        model_result,
        selected_category=selected_category,
        model_output_invalid=model_output_invalid,
    )
    legacy_result = {
        "classification": structured_result["classification"],
        "confidence": structured_result["model_confidence"] or 0,
        "observations": structured_result["observations"],
        "abnormalities": structured_result["abnormalities"],
        "recommendation": structured_result["recommendation"],
        "image_quality": structured_result["image_quality"]["model_assessment"],
    }
    return structured_result, legacy_result


ANALYSIS_DISCLAIMER = (
    "Preliminary visual screening support only; not a diagnosis and cannot rule out "
    "disease. A Medical Officer must review the original images and clinical findings."
)


VALIDATION_DISCLAIMER = (
    "Image suitability validation only. Not a diagnosis and cannot rule out disease. "
    "Uncertain images require authorized human review. The selected category is never changed."
)


@app.post("/api/validate-screening-image")
async def validate_screening_image_endpoint(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form(...),
):
    """Category suitability check for MOUTH / TONGUE / SKIN screening photos."""
    require_internal_ai_request(request)
    try:
        expected = normalize_category(category)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    image_bytes = await file.read(MAX_IMAGE_BYTES + 1)
    try:
        result = await validate_screening_image(
            image_bytes,
            file.content_type or "",
            expected,
            classifier=category_classifier,
            require_classifier=True,
        )
        return {
            "status": "success",
            "validation": result,
            "supported_categories": list(IMAGE_CATEGORIES),
            "disclaimer": VALIDATION_DISCLAIMER,
        }
    finally:
        await file.close()


@app.post("/api/analyze-oral-image")
async def analyze_oral_image(
    request: Request,
    file: UploadFile = File(...),
    view: str = Form("UNSPECIFIED"),
    category: str = Form("MOUTH"),
    screening_reference: str | None = Form(None),
):
    require_internal_ai_request(request)
    if view != "UNSPECIFIED" and view not in SCREENING_ANALYSIS_VIEWS:
        raise HTTPException(status_code=400, detail="Choose the front, left or right view.")
    try:
        selected_category = normalize_category(category)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if screening_reference is not None:
        try:
            screening_reference = str(uuid.UUID(screening_reference))
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Invalid screening reference.") from error

    try:
        structured_result, legacy_result = await analyze_uploaded_image(
            file,
            view,
            screening_reference,
            selected_category=selected_category,
            skip_model_on_quality_warning=False,
        )
        return {
            "status": "success",
            "filename": file.filename,
            "model": MODEL,
            "result": legacy_result,
            "analysis": structured_result,
            "disclaimer": ANALYSIS_DISCLAIMER,
        }
    finally:
        await file.close()


@app.post("/api/analyze-screening")
async def analyze_screening(
    request: Request,
    screening_reference: str = Form(...),
    category: str = Form("MOUTH"),
    front: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),
):
    require_internal_ai_request(request)
    try:
        screening_reference = str(uuid.UUID(screening_reference))
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid screening reference.") from error
    try:
        selected_category = normalize_category(category)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    uploaded_files = {
        "FRONT_VIEW": front,
        "LEFT_VIEW": left,
        "RIGHT_VIEW": right,
    }
    results = []
    try:
        for view in SCREENING_ANALYSIS_VIEWS:
            result, _ = await analyze_uploaded_image(
                uploaded_files[view],
                view,
                screening_reference,
                selected_category=selected_category,
                skip_model_on_quality_warning=True,
                tolerate_invalid_model_output=True,
            )
            results.append(result)
    finally:
        for image_file in uploaded_files.values():
            await image_file.close()

    return {
        "status": "success",
        "analysis": {
            "screening_reference": screening_reference,
            "model_information": vision_model.get_model_information(),
            "views": results,
            "review_status": "PENDING_MEDICAL_OFFICER_REVIEW",
            "disclaimer": ANALYSIS_DISCLAIMER,
        },
    }


# ==================================================
# 11. APPLICATION ENTRY POINT
# ==================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8010")),
        reload=os.getenv("UVICORN_RELOAD", "").strip().lower() in ("1", "true", "yes"),
    )
