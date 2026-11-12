"""
Screening image suitability validation by category (MOUTH, TONGUE, SKIN).

This module checks whether an uploaded photo is suitable for the selected
screening category. It is NOT a clinical diagnosis service and must never
declare a patient healthy or diseased.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Protocol

from starlette.concurrency import run_in_threadpool

from oral_analysis import (
    InvalidImageError,
    prepare_image,
)

logger = logging.getLogger("oral-image-api")

IMAGE_CATEGORIES = ("MOUTH", "TONGUE", "SKIN")
VALIDATION_STATUSES = (
    "VALID",
    "INVALID_CATEGORY",
    "POOR_QUALITY",
    "CORRUPTED_IMAGE",
    "NEEDS_REVIEW",
)

CATEGORY_REQUIREMENTS = {
    "MOUTH": (
        "Verify that an open mouth / oral cavity is clearly visible. "
        "Teeth, gums or oral mucosa should be identifiable. "
        "Reject tongue-only close-ups, bare skin, selfies, landscapes and unrelated objects."
    ),
    "TONGUE": (
        "Verify that the tongue is clearly the main visible subject. "
        "Reject unrelated mouth interiors without tongue, bare skin, selfies, "
        "landscapes and unrelated objects."
    ),
    "SKIN": (
        "Verify that a skin or body-surface area is clearly visible. "
        "Reject mouth/oral cavity, tongue, selfies of the whole face as the subject, "
        "landscapes, animals and unrelated objects."
    ),
}

SUITABILITY_PROMPT = """
You are checking whether a medical screening photo matches the selected category.
This is image suitability validation only. Never diagnose disease. Never say the
patient is healthy or diseased.

Selected category: {category}
Requirement: {requirement}

Return ONLY a JSON object with:
{{
  "detected_category": "MOUTH" | "TONGUE" | "SKIN" | "UNRELATED" | "UNCERTAIN",
  "confidence": integer 0-100,
  "reason": "short plain-language suitability reason"
}}
"""


class CategoryClassifier(Protocol):
    async def classify(self, image_data: bytes, category: str) -> dict:
        ...


def normalize_category(value: str | None) -> str:
    raw = (value or "").strip().upper().replace("-", "_").replace(" ", "_")
    if raw in {"ORAL", "ORAL_CAVITY", "MOUTH_ORAL", "MOUTH"}:
        return "MOUTH"
    if raw in IMAGE_CATEGORIES:
        return raw
    raise ValueError("Choose MOUTH, TONGUE or SKIN as the screening image category.")


def map_quality_to_status(quality: dict) -> str | None:
    warnings = quality.get("warnings") or []
    if not warnings:
        return None
    if "dimensions" in warnings or "blur" in warnings or "dark" in warnings or "bright" in warnings:
        return "POOR_QUALITY"
    return "POOR_QUALITY"


def attach_upload_policy(result: dict, *, force_block: bool = False) -> dict:
    """VALID and model-based NEEDS_REVIEW may upload; failures and mismatches must not."""
    status = result.get("status")
    if force_block:
        result["upload_allowed"] = False
    elif status in {"VALID", "NEEDS_REVIEW"}:
        result["upload_allowed"] = True
    else:
        result["upload_allowed"] = False
    return result


def decide_validation_result(
    *,
    expected_category: str,
    quality: dict,
    detected_category: str | None = None,
    confidence: int | None = None,
    reason: str | None = None,
    force_block: bool = False,
) -> dict:
    expected = normalize_category(expected_category)
    quality_status = map_quality_to_status(quality)
    if quality_status:
        return attach_upload_policy({
            "status": "POOR_QUALITY",
            "expected_category": expected,
            "detected_category": detected_category,
            "confidence": confidence,
            "reason": reason or "Image quality is too poor for reliable screening capture.",
            "image_quality": quality,
            "clinical_note": "Suitability check only. Not a diagnosis.",
        }, force_block=True)

    detected = (detected_category or "UNCERTAIN").strip().upper()
    if detected == "UNRELATED":
        return attach_upload_policy({
            "status": "INVALID_CATEGORY",
            "expected_category": expected,
            "detected_category": detected,
            "confidence": confidence,
            "reason": reason or "The image does not show the selected screening category.",
            "image_quality": quality,
            "clinical_note": "Suitability check only. Not a diagnosis.",
        }, force_block=True)

    if detected in IMAGE_CATEGORIES and detected != expected:
        return attach_upload_policy({
            "status": "INVALID_CATEGORY",
            "expected_category": expected,
            "detected_category": detected,
            "confidence": confidence,
            "reason": reason or (
                f"Selected category is {expected}, but the image appears to show {detected}."
            ),
            "image_quality": quality,
            "clinical_note": "Suitability check only. Not a diagnosis. Category was not changed.",
        }, force_block=True)

    if detected == "UNCERTAIN" or confidence is None or confidence < 55:
        return attach_upload_policy({
            "status": "NEEDS_REVIEW",
            "expected_category": expected,
            "detected_category": detected,
            "confidence": confidence,
            "reason": reason or "Image category could not be confirmed with enough confidence.",
            "image_quality": quality,
            "clinical_note": "Suitability check only. Send to authorized human review.",
        }, force_block=force_block)

    if detected == expected:
        return attach_upload_policy({
            "status": "VALID",
            "expected_category": expected,
            "detected_category": detected,
            "confidence": confidence,
            "reason": reason or "Image appears suitable for the selected screening category.",
            "image_quality": quality,
            "clinical_note": "Suitability check only. Not a diagnosis.",
        }, force_block=force_block)

    return attach_upload_policy({
        "status": "NEEDS_REVIEW",
        "expected_category": expected,
        "detected_category": detected,
        "confidence": confidence,
        "reason": reason or "Image needs authorized human review before screening use.",
        "image_quality": quality,
        "clinical_note": "Suitability check only. Not a diagnosis.",
    }, force_block=force_block)


def classifier_failure_reason(error: Exception) -> str:
    status = getattr(error, "status_code", None)
    if status == 402:
        return (
            "Vision category check unavailable (model payment required). "
            "The photo was not accepted for screening."
        )
    if status in (401, 403):
        return (
            "Vision category check unavailable (model authentication failed). "
            "The photo was not accepted for screening."
        )
    if status == 429:
        return (
            "Vision category check is rate-limited. "
            "Try again shortly. The photo was not accepted for screening."
        )
    return (
        "Category classification failed; the photo was not accepted until "
        "the vision category check works."
    )


def validate_classifier_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Category classifier must return a JSON object.")
    detected = str(payload.get("detected_category") or "").strip().upper()
    if detected not in {"MOUTH", "TONGUE", "SKIN", "UNRELATED", "UNCERTAIN"}:
        raise ValueError("Category classifier returned an unsupported category.")
    confidence = payload.get("confidence")
    if type(confidence) is not int or not 0 <= confidence <= 100:
        raise ValueError("Category classifier confidence must be an integer from 0 to 100.")
    reason = payload.get("reason")
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 500:
        raise ValueError("Category classifier reason is invalid.")
    return {
        "detected_category": detected,
        "confidence": confidence,
        "reason": reason.strip(),
    }


def extract_classifier_json(text) -> dict:
    if isinstance(text, dict):
        return validate_classifier_payload(text)
    if isinstance(text, list) and len(text) == 1 and isinstance(text[0], dict):
        return validate_classifier_payload(text[0])
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Category classifier returned an empty response.")
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("Category classifier did not return JSON.")
        payload = json.loads(cleaned[start:end + 1])
    return validate_classifier_payload(payload)


class GemmaCategoryClassifier:
    def __init__(self, client, model_name: str):
        self.client = client
        self.model_name = model_name

    async def classify(self, image_data: bytes, category: str) -> dict:
        prompt = SUITABILITY_PROMPT.format(
            category=category,
            requirement=CATEGORY_REQUIREMENTS[category],
        )
        # Cloudflare (or compatible) chat client; JSON is enforced in the prompt.
        response = await run_in_threadpool(
            self.client.chat,
            model=self.model_name,
            messages=[{
                "role": "user",
                "content": prompt,
                "images": [image_data],
            }],
            format="json",
            options={"temperature": 0},
        )
        content = getattr(getattr(response, "message", None), "content", None)
        if content is None and isinstance(response, dict):
            content = (response.get("message") or {}).get("content")
        return extract_classifier_json(content or "")


async def validate_screening_image(
    image_bytes: bytes,
    content_type: str,
    category: str,
    classifier: CategoryClassifier | None = None,
    *,
    require_classifier: bool = False,
) -> dict:
    expected = normalize_category(category)
    try:
        prepared, _image, quality = prepare_image(image_bytes, content_type)
    except InvalidImageError as error:
        message = str(error)
        return attach_upload_policy({
            "status": "CORRUPTED_IMAGE",
            "expected_category": expected,
            "detected_category": None,
            "confidence": None,
            "reason": message,
            "image_quality": None,
            "clinical_note": "Suitability check only. Not a diagnosis.",
        }, force_block=True)

    quality_status = map_quality_to_status(quality)
    if quality_status and not classifier:
        return decide_validation_result(
            expected_category=expected,
            quality=quality,
        )

    if classifier is None:
        # Without a live classifier, do not accept uploads (unrelated images would slip through).
        return decide_validation_result(
            expected_category=expected,
            quality=quality,
            detected_category="UNCERTAIN",
            confidence=0,
            reason=(
                "Category classifier is unavailable; the photo was not accepted for screening."
                if require_classifier
                else "Category match could not be automated; the photo was not accepted for screening."
            ),
            force_block=True,
        )

    try:
        classified = await classifier.classify(prepared, expected)
    except Exception as error:
        logger.warning(
            "Category classifier failed: %s",
            f"{type(error).__name__}|status={getattr(error, 'status_code', None)}|{error}",
        )
        return decide_validation_result(
            expected_category=expected,
            quality=quality,
            detected_category="UNCERTAIN",
            confidence=0,
            reason=classifier_failure_reason(error),
            force_block=True,
        )

    # Prefer local quality rejection even if the model liked the frame.
    if quality_status:
        return decide_validation_result(
            expected_category=expected,
            quality=quality,
            detected_category=classified["detected_category"],
            confidence=classified["confidence"],
            reason="Image quality is too poor for reliable screening capture.",
        )

    return decide_validation_result(
        expected_category=expected,
        quality=quality,
        detected_category=classified["detected_category"],
        confidence=classified["confidence"],
        reason=classified["reason"],
    )
