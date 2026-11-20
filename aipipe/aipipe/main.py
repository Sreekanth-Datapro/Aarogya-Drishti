
import os
import logging
import ipaddress
import hashlib
import json
import secrets
import uuid
from datetime import datetime, timezone
from time import perf_counter

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from cloudflare_vision import CloudflareVisionError, CloudflareWorkersAIClient, DEFAULT_MODEL
from oral_analysis import (
    CLINICIAN_REVIEW_RECOMMENDATION,
    INSUFFICIENT_IMAGE_QUALITY,
    MAX_IMAGE_BYTES,
    GemmaCloudVision,
    InvalidImageError,
    OralVisionModel,
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
SCREENING_ANALYSIS_VIEWS = ("FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW")
SAFE_ERROR_CODES = frozenset({
    "QUALITY_GATE_SKIPPED",
    "PROVIDER_TIMEOUT",
    "PROVIDER_REQUEST_FAILED",
    "PROVIDER_HTTP_ERROR",
    "PROVIDER_RATE_LIMIT",
    "PROVIDER_RESPONSE_INVALID",
    "PROVIDER_RESPONSE_EMPTY",
    "PROVIDER_TRACE_MISSING",
    "MODEL_OUTPUT_INVALID",
    "MODEL_NOT_ASSESSABLE",
})

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


def log_ai_flow(event: str, **details) -> None:
    safe_details = " ".join(f"{key}={value}" for key, value in details.items())
    logger.info("oral-screening-ai %s %s", event, safe_details)


def screening_log_reference(screening_reference: str | None) -> str:
    if not screening_reference:
        return "unavailable"
    return hashlib.sha256(screening_reference.encode("utf-8")).hexdigest()[:12]


def normalize_provider_trace(trace: dict | None) -> dict:
    trace = trace if isinstance(trace, dict) else {}
    http_status = trace.get("provider_http_status")
    if not isinstance(http_status, int) or isinstance(http_status, bool):
        http_status = None
    error_code = trace.get("error_code")
    if error_code not in SAFE_ERROR_CODES:
        error_code = None
    inference_duration_ms = trace.get("inference_duration_ms")
    if (not isinstance(inference_duration_ms, int)
            or isinstance(inference_duration_ms, bool)
            or inference_duration_ms < 0):
        inference_duration_ms = None
    request_success = trace.get("provider_request_success") is True
    response_received = trace.get("provider_response_received") is True
    return {
        "provider_request_started": trace.get("provider_request_started") is True,
        "provider_request_success": request_success,
        "provider_response_received": response_received,
        "provider_http_status": http_status,
        "inference_performed": request_success and response_received,
        "provider_response_validated": trace.get("provider_response_validated") is True,
        "model_output_usable": trace.get("model_output_usable") is True,
        "inference_duration_ms": inference_duration_ms,
        "error_code": error_code,
    }


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
    log_ai_flow(
        "image_received",
        bytes=len(image_bytes),
        mime_type=file.content_type or "unknown",
    )
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Maximum image size is 10 MB.")
    try:
        image_data, _, quality = prepare_image(image_bytes, file.content_type or "")
    except InvalidImageError as error:
        status = 413 if "10 MB" in str(error) else 400
        raise HTTPException(status_code=status, detail=str(error)) from error
    log_ai_flow("image_preprocessed", bytes=len(image_data), quality=quality["status"])
    return image_data, quality


def build_view_result(
    view: str,
    screening_reference: str | None,
    quality: dict,
    model_result: dict | None,
    *,
    selected_category: str = "MOUTH",
    model_output_invalid: bool = False,
    analysis_failed: bool = False,
    provider_trace: dict | None = None,
) -> dict:
    warnings = ["IMAGE_QUALITY_NEEDS_REVIEW"] if quality["warnings"] else []
    trace = normalize_provider_trace(provider_trace)
    quality_insufficient = quality["status"] == "RECAPTURE"
    model_not_assessable = bool(
        model_result and model_result.get("model_status") == "NOT_ASSESSABLE"
    )
    trace_complete = (
        trace["provider_request_started"]
        and trace["provider_request_success"]
        and trace["provider_response_received"]
        and trace["provider_response_validated"]
    )
    usable_model = bool(
        model_result
        and model_result.get("model_status") == "OK"
        and trace_complete
        and trace["model_output_usable"]
        and quality["status"] == "ACCEPTABLE"
        and not quality["warnings"]
    )

    if quality_insufficient:
        classification = "UNCERTAIN"
        observations = []
        abnormalities = []
        model_image_quality = "POOR"
        model_status = "NOT_ASSESSABLE"
        findings = []
        not_assessable_reason = INSUFFICIENT_IMAGE_QUALITY
        error_code = "QUALITY_GATE_SKIPPED"
        warnings.extend(["IMAGE_QUALITY_NEEDS_REVIEW", "CLINICIAN_REVIEW_REQUIRED"])
    elif analysis_failed:
        classification = "UNCERTAIN"
        observations = []
        abnormalities = []
        model_image_quality = "UNKNOWN"
        model_status = "ANALYSIS_FAILED"
        findings = []
        not_assessable_reason = "AI analysis could not be completed for this image. Retry the analysis."
        error_code = trace["error_code"] or "PROVIDER_REQUEST_FAILED"
        warnings.extend(["ANALYSIS_FAILED", "CLINICIAN_REVIEW_REQUIRED"])
    elif model_output_invalid:
        classification = "UNCERTAIN"
        observations = []
        abnormalities = []
        model_image_quality = "UNKNOWN"
        model_status = "INVALID_OUTPUT"
        findings = []
        not_assessable_reason = "The AI model's answer for this view could not be used."
        error_code = trace["error_code"] or "MODEL_OUTPUT_INVALID"
        warnings.extend(["MODEL_RESPONSE_INVALID", "CLINICIAN_REVIEW_REQUIRED"])
    elif model_not_assessable or (
        model_result
        and trace["provider_response_validated"]
        and not trace["model_output_usable"]
    ):
        classification = "UNCERTAIN"
        observations = []
        abnormalities = []
        model_image_quality = model_result["image_quality"]
        model_status = "NOT_ASSESSABLE"
        findings = []
        not_assessable_reason = model_result.get("not_assessable_reason") or (
            "The validated AI response could not reliably assess every required finding."
        )
        error_code = "MODEL_NOT_ASSESSABLE"
        warnings.append("CLINICIAN_REVIEW_REQUIRED")
    elif usable_model:
        classification = model_result["classification"]
        observations = model_result["observations"]
        abnormalities = model_result["abnormalities"]
        model_image_quality = model_result["image_quality"]
        model_status = "OK"
        findings = model_result.get("possible_visual_findings") or []
        not_assessable_reason = model_result.get("not_assessable_reason")
        selected_category = model_result.get("selected_category") or selected_category
        if classification == "UNCERTAIN":
            warnings.append("MODEL_RESULT_UNCERTAIN")
        error_code = None
    else:
        classification = "UNCERTAIN"
        observations = []
        abnormalities = []
        model_image_quality = "UNKNOWN"
        model_status = "INVALID_OUTPUT"
        findings = []
        not_assessable_reason = "The AI response could not be verified and must be retried."
        error_code = trace["error_code"] or "PROVIDER_TRACE_MISSING"
        warnings.extend(["MODEL_RESPONSE_INVALID", "CLINICIAN_REVIEW_REQUIRED"])

    trace["error_code"] = error_code
    return {
        "view": view,
        "analysis_status": "COMPLETED" if usable_model else "FAILED",
        "analysis_error": (
            None if usable_model
            else "AI analysis could not be completed for this image. Retry the analysis."
        ),
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "error_code": error_code,
        "selected_category": selected_category,
        "screening_reference": screening_reference,
        "classification": classification,
        "model_status": model_status,
        "possible_visual_findings": findings,
        "not_assessable_reason": not_assessable_reason,
        "observations": observations,
        "abnormalities": abnormalities,
        "recommendation": CLINICIAN_REVIEW_RECOMMENDATION,
        "image_quality": {
            **{key: value for key, value in quality.items() if key != "score_report"},
            "model_assessment": model_image_quality,
        },
        "model_information": {
            **vision_model.get_model_information(),
            **trace,
            "inference_performed": trace["inference_performed"],
            "model_output_usable": usable_model,
        },
        "uncertainty_warnings": warnings,
        "review_status": "PENDING_MEDICAL_OFFICER_REVIEW",
    }


def model_failure_response(error: Exception) -> tuple[int, str]:
    status = getattr(error, "status_code", None)
    if status == 504 or "timeout" in type(error).__name__.lower():
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
    tolerate_analysis_failure: bool = False,
) -> tuple[dict, dict]:
    image_data, quality = await prepare_upload(file)
    model_result = None
    model_output_invalid = False
    analysis_failed = False
    provider_trace = {}
    reference_hash = screening_log_reference(screening_reference)
    model_information = vision_model.get_model_information()
    if not (skip_model_on_quality_warning and quality["warnings"]):
        try:
            log_ai_flow(
                "provider_request_calling",
                provider=model_information["provider"],
                model=model_information["model_version"],
                screening_ref=reference_hash,
                view=view,
                category=selected_category,
                image_bytes=len(image_data),
            )
            model_result = await vision_model.analyze(
                image_data,
                view,
                selected_category,
                screening_reference=screening_reference,
            )
            provider_trace = normalize_provider_trace(model_result.get("provider_trace"))
            log_ai_flow(
                "provider_response_received",
                provider=model_information["provider"],
                model=model_information["model_version"],
                screening_ref=reference_hash,
                view=view,
                http_status=provider_trace["provider_http_status"] or "unknown",
                request_success=provider_trace["provider_request_success"],
                response_validated=provider_trace["provider_response_validated"],
                inference_performed=provider_trace["inference_performed"],
                model_output_usable=provider_trace["model_output_usable"],
                inference_duration_ms=provider_trace["inference_duration_ms"] or "unknown",
            )
        except ValueError as error:
            provider_trace = normalize_provider_trace(getattr(error, "provider_trace", None))
            provider_trace["error_code"] = (
                provider_trace["error_code"] or "MODEL_OUTPUT_INVALID"
            )
            logger.warning(
                "oral-screening-ai provider_output_invalid screening_ref=%s view=%s error_code=%s",
                reference_hash,
                view,
                provider_trace["error_code"],
            )
            log_ai_flow(
                "inference_failed",
                provider=model_information["provider"],
                model=model_information["model_version"],
                screening_ref=reference_hash,
                view=view,
                inference_performed=provider_trace["inference_performed"],
                model_output_usable=False,
                inference_duration_ms=provider_trace["inference_duration_ms"] or "unknown",
                error_code=provider_trace["error_code"],
            )
            if not tolerate_invalid_model_output:
                raise HTTPException(status_code=502, detail="The vision model returned an invalid response.") from error
            model_output_invalid = True
        except Exception as error:
            provider_trace = normalize_provider_trace(getattr(error, "provider_trace", None))
            provider_trace["error_code"] = (
                provider_trace["error_code"] or "PROVIDER_REQUEST_FAILED"
            )
            logger.error(
                "oral-screening-ai provider_request_failed screening_ref=%s view=%s error_code=%s http_status=%s",
                reference_hash,
                view,
                provider_trace["error_code"],
                provider_trace["provider_http_status"] or "unknown",
            )
            log_ai_flow(
                "inference_failed",
                provider=model_information["provider"],
                model=model_information["model_version"],
                screening_ref=reference_hash,
                view=view,
                inference_performed=provider_trace["inference_performed"],
                model_output_usable=False,
                inference_duration_ms=provider_trace["inference_duration_ms"] or "unknown",
                error_code=provider_trace["error_code"],
            )
            if tolerate_analysis_failure:
                analysis_failed = True
            else:
                status, message = model_failure_response(error)
                raise HTTPException(status_code=status, detail=message) from error
    elif quality["warnings"]:
        provider_trace = normalize_provider_trace({
            "error_code": "QUALITY_GATE_SKIPPED",
        })
        log_ai_flow(
            "inference_skipped",
            provider=model_information["provider"],
            model=model_information["model_version"],
            screening_ref=reference_hash,
            view=view,
            reason="QUALITY_GATE_SKIPPED",
        )

    structured_result = build_view_result(
        view,
        screening_reference,
        quality,
        model_result,
        selected_category=selected_category,
        model_output_invalid=model_output_invalid,
        analysis_failed=analysis_failed,
        provider_trace=provider_trace,
    )
    log_ai_flow(
        "response_parsing_completed",
        screening_ref=reference_hash,
        view=view,
        provider=model_information["provider"],
        model=model_information["model_version"],
        analysis_status=structured_result["analysis_status"],
        model_status=structured_result["model_status"],
        inference_performed=structured_result["model_information"]["inference_performed"],
        model_output_usable=structured_result["model_information"]["model_output_usable"],
        inference_duration_ms=structured_result["model_information"]["inference_duration_ms"] or "unknown",
        finding_count=len(structured_result["possible_visual_findings"]),
    )
    legacy_result = {
        "classification": structured_result["classification"],
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

ASSISTANT_SYSTEM_PROMPT = """
You are a helpful general assistant. Answer both Aarogya Drishti project questions
and unrelated general questions; do not restrict answers to the project.

Verified Aarogya Drishti project context:
- The frontend is React, the application API is Node.js/Express, and data is stored
  in PostgreSQL.
- The backend exposes registration review, oral screening, patient tracking,
  specialist referral, appointment, care-plan, and follow-up workflows.
- The oral image-analysis service is Python FastAPI and uses Cloudflare Workers AI.
  Its vision model is experimental and not clinically validated; it cannot diagnose
  or rule out cancer. A qualified clinician must review medical concerns.
- Sarvam AI is used by existing backend speech routes for speech recognition
  (saaras:v4) and speech synthesis (bulbul:v3), not as the text chat engine.
- The global voice assistant reuses those speech routes for Telugu and English
  input/output where the user's role is authorized.
When a user attaches an image, describe visible contents or answer their question
about it. Image observations are informational only, not a medical diagnosis.
Never infer a diagnosis, and recommend a qualified clinician for medical concerns.

Use only this context for project-specific claims. If a feature or status is not
described here, say you do not have that information. This context was prepared
from project source; do not claim live access to source code, service state,
accounts, or patient records.

By default, answer in 2–5 short, simple sentences. Be direct, use bullets only when
helpful, and expand only when asked for detail. Answer in Telugu for Telugu, English
for English, and naturally mirror Telugu-English mixed questions. Follow an
explicit reply-language preference; when it is auto, use the user's language.
Answer greetings naturally. Never provide a diagnosis, cancer probability, or
treatment plan; direct personal medical questions to a qualified clinician.
Do not request patient names, IDs, phone numbers, images, or other identifying
health information. For time-sensitive facts, be clear when you cannot verify
that the information is current.
""".strip()


@app.post("/api/assistant/chat")
async def assistant_chat(request: Request):
    require_internal_ai_request(request)
    image_bytes = None
    try:
        content_type = request.headers.get("content-type", "").lower()
        if content_type.startswith("multipart/form-data"):
            async with request.form(max_files=1, max_fields=4) as form:
                raw_messages = form.get("messages")
                locale = form.get("locale", "auto")
                messages = json.loads(raw_messages) if isinstance(raw_messages, str) else None
                image = form.get("image")
                if image is not None:
                    if not hasattr(image, "read"):
                        raise HTTPException(status_code=400, detail="A valid image file is required.")
                    raw_image = await image.read(MAX_IMAGE_BYTES + 1)
                    if len(raw_image) > MAX_IMAGE_BYTES:
                        raise HTTPException(status_code=413, detail="Images must be 10 MB or smaller.")
                    image_bytes, _, _ = prepare_image(raw_image, image.content_type or "")
        elif content_type.startswith("application/json"):
            payload = await request.json()
            if not isinstance(payload, dict):
                raise HTTPException(status_code=400, detail="A valid JSON chat request is required.")
            locale = payload.get("locale", "auto")
            messages = payload.get("messages")
        else:
            raise HTTPException(status_code=415, detail="Send JSON or multipart form data.")
    except HTTPException:
        raise
    except InvalidImageError as error:
        status = 413 if "10 MB" in str(error) else 400
        message = "Images must be 10 MB or smaller." if status == 413 else "Use a valid JPEG, PNG, or WEBP image."
        raise HTTPException(status_code=status, detail=message) from error
    except (ValueError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=400, detail="A valid chat request is required.") from error
    except Exception as error:
        logger.warning("assistant_chat_request_invalid error_type=%s", type(error).__name__)
        raise HTTPException(status_code=400, detail="A valid chat request is required.") from error

    if not isinstance(locale, str) or locale not in {"auto", "en", "te"}:
        raise HTTPException(status_code=400, detail="Choose Telugu, English, or automatic language detection.")
    if not isinstance(messages, list) or not messages or len(messages) > 12:
        raise HTTPException(status_code=400, detail="Send between 1 and 12 recent chat messages.")

    safe_messages = []
    for message in messages:
        if not isinstance(message, dict) or message.get("role") not in {"user", "assistant"}:
            raise HTTPException(status_code=400, detail="Chat messages must have a user or assistant role.")
        content = message.get("content")
        allow_empty_image_prompt = image_bytes is not None and message is messages[-1] and message.get("role") == "user"
        if not isinstance(content, str) or (not content.strip() and not allow_empty_image_prompt) or len(content) > 2000:
            raise HTTPException(status_code=400, detail="Each chat message must contain 1 to 2000 characters.")
        normalized_content = content.strip() or "Describe this image."
        safe_messages.append(f'{message["role"].upper()}: {normalized_content}')
    if not any(message["role"] == "user" for message in messages):
        raise HTTPException(status_code=400, detail="A user message is required.")

    prompt = (
        f"Reply language preference: {locale}.\n\n"
        "Conversation:\n"
        + "\n".join(safe_messages)
        + "\n\nAssistant:"
    )
    reference = secrets.token_hex(6)
    started_at = perf_counter()
    log_ai_flow(
        "assistant_chat_inference_started",
        screening_ref=reference,
        provider="cloudflare-workers-ai",
        model=MODEL,
        locale=locale,
        message_count=len(safe_messages),
        prompt_chars=len(prompt),
        image_received=image_bytes is not None,
        image_bytes=len(image_bytes) if image_bytes is not None else 0,
    )
    try:
        provider_message = {"role": "user", "content": prompt}
        if image_bytes is not None:
            provider_message["images"] = [image_bytes]
            provider_message["image_mime_type"] = "image/jpeg"
        response = await run_in_threadpool(
            client.chat,
            model=MODEL,
            messages=[provider_message],
            system_prompt=ASSISTANT_SYSTEM_PROMPT,
            options={"temperature": 0.2},
        )
    except CloudflareVisionError as error:
        duration_ms = round((perf_counter() - started_at) * 1000)
        trace = error.provider_trace
        log_ai_flow(
            "assistant_chat_inference_failed",
            screening_ref=reference,
            provider="cloudflare-workers-ai",
            model=MODEL,
            provider_request_started=trace["provider_request_started"],
            provider_response_received=trace["provider_response_received"],
            duration_ms=duration_ms,
            error_code=trace["error_code"],
            http_status=trace["provider_http_status"] or "unknown",
        )
        status = 504 if error.status_code == 504 else 502
        raise HTTPException(status_code=status, detail="The assistant could not get a response. Please try again.") from error
    except Exception as error:
        duration_ms = round((perf_counter() - started_at) * 1000)
        log_ai_flow(
            "assistant_chat_inference_failed",
            screening_ref=reference,
            provider="cloudflare-workers-ai",
            model=MODEL,
            duration_ms=duration_ms,
            error_code="PROVIDER_REQUEST_FAILED",
        )
        raise HTTPException(status_code=502, detail="The assistant could not get a response. Please try again.") from error

    trace = getattr(response, "provider_trace", None)
    content = getattr(getattr(response, "message", None), "content", None)
    if not (
        isinstance(trace, dict)
        and trace.get("provider_request_started") is True
        and trace.get("provider_request_success") is True
        and trace.get("provider_response_received") is True
        and isinstance(content, str)
        and content.strip()
    ):
        duration_ms = round((perf_counter() - started_at) * 1000)
        log_ai_flow(
            "assistant_chat_response_rejected",
            screening_ref=reference,
            provider="cloudflare-workers-ai",
            model=MODEL,
            duration_ms=duration_ms,
            error_code="PROVIDER_RESPONSE_INVALID",
        )
        raise HTTPException(status_code=502, detail="The assistant returned an unusable response. Please try again.")

    reply = content.strip()
    duration_ms = round((perf_counter() - started_at) * 1000)
    log_ai_flow(
        "assistant_chat_response_validated",
        screening_ref=reference,
        provider="cloudflare-workers-ai",
        model=MODEL,
        provider_http_status=trace.get("provider_http_status") or "unknown",
        response_validated=True,
        duration_ms=duration_ms,
        response_chars=len(reply),
    )
    return {
        "status": "success",
        "reply": reply,
        "model_information": vision_model.get_model_information(),
        "provider_trace": {
            "provider_request_started": True,
            "provider_request_success": True,
            "provider_response_received": True,
            "provider_response_validated": True,
            "inference_performed": True,
            "model_output_usable": True,
            "inference_duration_ms": duration_ms,
        },
    }


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
    front: UploadFile | None = File(None),
    left: UploadFile | None = File(None),
    right: UploadFile | None = File(None),
    front_category: str | None = Form(None),
    left_category: str | None = Form(None),
    right_category: str | None = Form(None),
):
    require_internal_ai_request(request)
    try:
        screening_reference = str(uuid.UUID(screening_reference))
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid screening reference.") from error
    uploaded_files = {
        "FRONT_VIEW": (front, front_category),
        "LEFT_VIEW": (left, left_category),
        "RIGHT_VIEW": (right, right_category),
    }
    uploaded_files = {
        view: (image_file, selected_category)
        for view, (image_file, selected_category) in uploaded_files.items()
        if image_file is not None
    }
    if not uploaded_files:
        raise HTTPException(status_code=400, detail="Upload at least one screening photo.")

    log_ai_flow(
        "request_received",
        endpoint="POST /api/analyze-screening",
        screening_ref=screening_log_reference(screening_reference),
        views=",".join(uploaded_files),
    )
    results = []
    try:
        for view in SCREENING_ANALYSIS_VIEWS:
            if view not in uploaded_files:
                continue
            image_file, category_for_view = uploaded_files[view]
            try:
                selected_category = normalize_category(category_for_view or category)
            except ValueError as error:
                raise HTTPException(status_code=400, detail=str(error)) from error
            result, _ = await analyze_uploaded_image(
                image_file,
                view,
                screening_reference,
                selected_category=selected_category,
                skip_model_on_quality_warning=True,
                tolerate_invalid_model_output=True,
                tolerate_analysis_failure=True,
            )
            results.append(result)
    finally:
        for image_file, _selected_category in uploaded_files.values():
            await image_file.close()

    response = {
        "status": "success",
        "analysis": {
            "screening_reference": screening_reference,
            "model_information": vision_model.get_model_information(),
            "views": results,
            "review_status": "PENDING_MEDICAL_OFFICER_REVIEW",
            "disclaimer": ANALYSIS_DISCLAIMER,
        },
    }
    log_ai_flow(
        "response_completed",
        screening_ref=screening_log_reference(screening_reference),
        image_count=len(results),
        failed_image_count=sum(result["analysis_status"] != "COMPLETED" for result in results),
    )
    return response


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
