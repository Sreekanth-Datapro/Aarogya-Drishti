import io
import json
import re
import warnings
from typing import Protocol

from PIL import Image, ImageOps, ImageStat, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool


MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}
VIEW_LABELS = {
    "FRONT_VIEW": "front",
    "LEFT_VIEW": "left",
    "RIGHT_VIEW": "right",
}
IMAGE_CATEGORIES = ("MOUTH", "TONGUE", "SKIN")
OBSERVATION_SCALES = frozenset({"0", "1", "2", "3", "N/A"})
MODEL_STATUSES = frozenset({"OK", "NOT_ASSESSABLE"})
IMAGE_QUALITY_VALUES = frozenset({"GOOD", "FAIR", "POOR", "UNKNOWN", "ACCEPTABLE", "NEEDS_REVIEW"})

CATEGORY_FEATURES = {
    "MOUTH": (
        "VISIBLE_REDNESS",
        "POSSIBLE_SWELLING",
        "WHITE_OR_RED_PATCHES",
        "VISIBLE_ULCERS",
        "GUM_APPEARANCE_CHANGES",
    ),
    "TONGUE": (
        "WHITE_COATING",
        "REDNESS",
        "VISIBLE_SORES",
        "SURFACE_CHANGES",
        "SWELLING",
    ),
    "SKIN": (
        "REDNESS",
        "VISIBLE_RASH",
        "PIGMENTATION_CHANGES",
        "SWELLING",
        "DRY_SCALY_APPEARANCE",
        "VISIBLE_SORES",
    ),
}

FEATURE_LABELS = {
    "VISIBLE_REDNESS": "Visible redness",
    "POSSIBLE_SWELLING": "Possible swelling",
    "WHITE_OR_RED_PATCHES": "White/red patches",
    "VISIBLE_ULCERS": "Visible ulcers",
    "GUM_APPEARANCE_CHANGES": "Gum appearance changes",
    "WHITE_COATING": "White coating",
    "REDNESS": "Redness",
    "VISIBLE_SORES": "Visible sores",
    "SURFACE_CHANGES": "Surface changes",
    "SWELLING": "Swelling",
    "VISIBLE_RASH": "Visible rash",
    "PIGMENTATION_CHANGES": "Pigmentation changes",
    "DRY_SCALY_APPEARANCE": "Dry/scaly appearance",
}

SCALE_LABELS = {
    "0": "Not observed",
    "1": "Mild appearance",
    "2": "Moderate appearance",
    "3": "Prominent appearance",
    "N/A": "Cannot assess",
}

CLINICIAN_REVIEW_RECOMMENDATION = (
    "A Medical Officer must review the original image and clinical findings "
    "before making any decision."
)
CLINICAL_SCORE_UNAVAILABLE = (
    "Clinical score unavailable — clinician assessment required."
)
VISUAL_HEALTH_SCORE_EXPLAINED = (
    "Score calculated from the visual findings returned by the AI model."
)
VISUAL_HEALTH_SCORE_UNAVAILABLE = (
    "Score Not Available – insufficient usable visual findings."
)
INSUFFICIENT_IMAGE_QUALITY = "Insufficient Image Quality"
# Technical quality floor: below this, visual evidence is not reliable enough
# for observation support (not a disease threshold).
INSUFFICIENT_QUALITY_SCORE = 40


class OralVisionModel(Protocol):
    """Interface for a vision provider; a trained oral-image model is not present."""

    def get_model_information(self) -> dict:
        ...

    async def analyze(self, image_data: bytes, view: str, category: str = "MOUTH") -> dict:
        ...


class InvalidImageError(ValueError):
    pass


def prepare_image(image_bytes: bytes, content_type: str) -> tuple[bytes, Image.Image, dict]:
    if not image_bytes:
        raise InvalidImageError("Uploaded image is empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise InvalidImageError("Maximum image size is 10 MB.")

    expected_format = ALLOWED_IMAGE_TYPES.get(content_type)
    if not expected_format:
        raise InvalidImageError("Only JPG, PNG and WEBP images are allowed.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            source = Image.open(io.BytesIO(image_bytes))
            if source.format != expected_format:
                raise InvalidImageError("Image content does not match its file type.")
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise InvalidImageError("Image dimensions are too large to process.")
            source.verify()

            source = Image.open(io.BytesIO(image_bytes))
            source.load()
            image = ImageOps.exif_transpose(source).convert("RGB")
    except InvalidImageError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, OSError, UnidentifiedImageError) as error:
        raise InvalidImageError("Invalid or corrupted image.") from error

    quality = inspect_image_quality(image)
    image_buffer = io.BytesIO()
    image.save(image_buffer, format="JPEG", quality=90)
    return image_buffer.getvalue(), image, quality


def inspect_image_quality(image: Image.Image) -> dict:
    gray = image.convert("L")
    scale = min(1.0, 256 / max(gray.size))
    sample_size = (
        max(1, round(gray.width * scale)),
        max(1, round(gray.height * scale)),
    )
    sample = gray.resize(sample_size)
    brightness = ImageStat.Stat(sample).mean[0]
    sharpness = _laplacian_variance(sample)

    warnings_found = []
    if max(image.size) < 640 or min(image.size) < 480:
        warnings_found.append("dimensions")
    if brightness < 45:
        warnings_found.append("dark")
    if brightness > 220:
        warnings_found.append("bright")
    if sharpness < 55:
        warnings_found.append("blur")

    quality = {
        "status": "RECAPTURE" if warnings_found else "ACCEPTABLE",
        "warnings": warnings_found,
        "metrics": {
            "width": image.width,
            "height": image.height,
            "brightness_mean": round(brightness, 2),
            "sharpness_variance": round(sharpness, 2),
        },
        "checker_version": "pillow-heuristics-v1",
    }
    quality["score_report"] = compute_image_quality_score(quality)
    return quality


def compute_image_quality_score(quality: dict) -> dict:
    """
    Transparent technical Image Quality Score (0–100).

    Validation basis (pillow-heuristics-v1, same gates as inspect_image_quality):
    - resolution: min edge ≥ 480 and max edge ≥ 640
    - lighting: mean luminance roughly 45–220
    - focus/blur: Laplacian variance ≥ 55 on a downscaled luminance sample

    This is NOT disease severity and NOT an overall clinical screening score.
    """
    metrics = quality.get("metrics") or {}
    warnings_found = list(quality.get("warnings") or [])
    width = int(metrics.get("width") or 0)
    height = int(metrics.get("height") or 0)
    brightness = float(metrics.get("brightness_mean") or 0.0)
    sharpness = float(metrics.get("sharpness_variance") or 0.0)

    criteria = []
    total = 100

    # --- Resolution ---
    dim_penalty = 0
    if width <= 0 or height <= 0 or "dimensions" in warnings_found or max(width, height) < 640 or min(width, height) < 480:
        dim_penalty = 40 if min(width, height) < 320 else 25
    total -= dim_penalty
    criteria.append({
        "criterion": "resolution",
        "observed_evidence": f"{width}x{height} pixels",
        "score_assigned": max(0, 100 - dim_penalty),
        "reason": (
            "Below the documented minimum capture size (max edge ≥ 640 and min edge ≥ 480)."
            if dim_penalty
            else "Meets the documented minimum capture size."
        ),
        "confidence": "high",
        "limitations": "Size only; does not judge anatomical framing or occlusion.",
    })

    # --- Lighting ---
    light_penalty = 0
    if brightness < 45 or "dark" in warnings_found:
        light_penalty = 40 if brightness < 20 else 25
    elif brightness > 220 or "bright" in warnings_found:
        light_penalty = 40 if brightness > 245 else 25
    total -= light_penalty
    if brightness < 45 or "dark" in warnings_found:
        light_reason = "Mean luminance is below the usable screening range (< 45)."
    elif brightness > 220 or "bright" in warnings_found:
        light_reason = "Mean luminance is above the usable screening range (> 220)."
    else:
        light_reason = "Mean luminance is within the usable screening range (45–220)."
    criteria.append({
        "criterion": "lighting",
        "observed_evidence": f"brightness_mean={round(brightness, 2)}",
        "score_assigned": max(0, 100 - light_penalty),
        "reason": light_reason,
        "confidence": "high",
        "limitations": "Global mean only; local glare or shadows may still hide features.",
    })

    # --- Focus / blur ---
    blur_penalty = 0
    if sharpness < 55 or "blur" in warnings_found:
        if sharpness < 15:
            blur_penalty = 45
        elif sharpness < 55:
            blur_penalty = 25 + int(round((55 - sharpness) / 55 * 20))
        else:
            blur_penalty = 25
    total -= blur_penalty
    criteria.append({
        "criterion": "focus_blur",
        "observed_evidence": f"sharpness_variance={round(sharpness, 2)}",
        "score_assigned": max(0, 100 - blur_penalty),
        "reason": (
            "Laplacian variance is below the focus threshold (< 55)."
            if blur_penalty
            else "Laplacian variance meets the focus threshold (≥ 55)."
        ),
        "confidence": "medium",
        "limitations": "Heuristic blur estimate; textured backgrounds can inflate sharpness.",
    })

    total = max(0, min(100, int(round(total))))
    insufficient = (
        total < INSUFFICIENT_QUALITY_SCORE
        or quality.get("status") == "RECAPTURE"
        or bool(warnings_found)
    )

    return {
        "methodology": "pillow-heuristics-v1",
        "status": "INSUFFICIENT" if insufficient else "SCORED",
        "score": None if insufficient else total,
        "raw_score": total,
        "label": INSUFFICIENT_IMAGE_QUALITY if insufficient else None,
        "criteria": criteria,
        "limitations": (
            "Technical capture quality only. Not disease severity. "
            "Not a validated overall clinical screening score."
        ),
        "recommendation": CLINICIAN_REVIEW_RECOMMENDATION,
    }


def build_criterion_scores(findings: list[dict]) -> list[dict]:
    """Per-feature appearance scores from model findings (0–3 / N/A). Not diagnosis."""
    reports = []
    for item in findings or []:
        feature = item.get("feature")
        scale = str(item.get("scale") if item.get("scale") is not None else "N/A")
        reports.append({
            "criterion": feature,
            "observed_evidence": item.get("note") or FEATURE_LABELS.get(feature, feature),
            "score_assigned": scale,
            "reason": SCALE_LABELS.get(scale, scale),
            "confidence": "low" if scale == "N/A" else "medium",
            "limitations": (
                "Appearance scale from vision-model JSON only; not clinically validated "
                "as disease severity or probability."
            ),
        })
    return reports


def compute_visual_health_assessment_score(
    findings: list[dict] | None,
    *,
    model_status: str,
) -> dict:
    """
    Deterministic AI Visual Health Assessment Score (0–100) from model findings only.

    Calculation (appearance aggregate — not clinical severity weights):
    - Use only findings actually returned by the model (caller must not pass padded defaults).
    - Usable scales: "0","1","2","3". "N/A" is unassessable and excluded.
    - Remap each usable scale with the model's own 0–3 appearance ladder:
        points = round((3 - scale) / 3 * 100)  →  0→100, 1→67, 2→33, 3→0
    - Score = round(mean(points)) across usable findings.
    - Equal weight per usable finding; no feature-specific clinical weights.
    - Does not use observation_confidence, image quality, brightness, blur, or resolution.
    - model_status must be OK; otherwise score is null.
    - Missing / empty / only-N/A findings → null ("Score Not Available").

    This is an experimental visual indicator only — not a diagnosis or disease-risk score.
    """
    unassessable = []
    for item in findings or []:
        scale = str(item.get("scale") if item.get("scale") is not None else "")
        if scale == "N/A":
            feature = item.get("feature")
            unassessable.append({
                "feature": feature,
                "scale": scale,
                "note": item.get("note"),
                "description": FEATURE_LABELS.get(feature, feature),
                "appearance": SCALE_LABELS.get(scale, scale),
            })

    empty = {
        "visual_health_assessment_score": None,
        "visual_health_assessment_score_message": VISUAL_HEALTH_SCORE_UNAVAILABLE,
        "visual_health_assessment_score_reasons": [],
        "visual_health_assessment_unassessable": unassessable,
    }

    if model_status != "OK":
        return empty

    points = []
    reasons = []
    for item in findings or []:
        scale = str(item.get("scale") if item.get("scale") is not None else "")
        if scale not in {"0", "1", "2", "3"}:
            continue
        feature = item.get("feature")
        assigned = int(round((3 - int(scale)) / 3 * 100))
        assigned = max(0, min(100, assigned))
        points.append(assigned)
        reasons.append({
            "feature": feature,
            "scale": scale,
            "points": assigned,
            "description": FEATURE_LABELS.get(feature, feature),
            "appearance": SCALE_LABELS.get(scale, scale),
            "note": item.get("note"),
            "reason": (
                f"{FEATURE_LABELS.get(feature, feature)}: "
                f"{SCALE_LABELS.get(scale, scale)} → {assigned}/100"
            ),
        })

    if not points:
        return empty

    score = int(round(sum(points) / len(points)))
    score = max(0, min(100, score))
    return {
        "visual_health_assessment_score": score,
        "visual_health_assessment_score_message": VISUAL_HEALTH_SCORE_EXPLAINED,
        "visual_health_assessment_score_reasons": reasons,
        "visual_health_assessment_unassessable": unassessable,
    }


def calibrate_observation_confidence(
    raw_confidence: int | None,
    quality_report: dict,
    model_status: str,
    findings: list[dict],
) -> int | None:
    """
    Cap model confidence by technical image quality and finding assessability.
    Never invents a fixed 100; never turns quality failures into high confidence.
    """
    if quality_report.get("status") == "INSUFFICIENT":
        return None
    if raw_confidence is None:
        return None
    if model_status in {"NOT_ASSESSABLE", "INVALID_OUTPUT"}:
        return min(int(raw_confidence), 30)

    quality_ceiling = quality_report.get("score")
    if quality_ceiling is None:
        return None

    capped = min(int(raw_confidence), int(quality_ceiling))
    na_count = sum(1 for item in findings or [] if str(item.get("scale")) == "N/A")
    if na_count:
        capped = min(capped, max(0, 100 - na_count * 12))
    return max(0, min(100, int(capped)))


def _laplacian_variance(sample: Image.Image) -> float:
    width, height = sample.size
    if width < 3 or height < 3:
        return 0.0

    pixels = sample.tobytes()
    total = 0
    total_squared = 0
    count = 0
    for y in range(1, height - 1):
        row = y * width
        for x in range(1, width - 1):
            index = row + x
            response = (
                pixels[index - width]
                + pixels[index - 1]
                + pixels[index + 1]
                + pixels[index + width]
                - 4 * pixels[index]
            )
            total += response
            total_squared += response * response
            count += 1

    mean = total / count
    return max(0.0, total_squared / count - mean * mean)


def extract_json_response(ai_output) -> dict:
    """Accept string or already-parsed object responses from Workers AI."""
    if isinstance(ai_output, dict):
        return ai_output
    if isinstance(ai_output, list) and len(ai_output) == 1 and isinstance(ai_output[0], dict):
        return ai_output[0]
    if not isinstance(ai_output, str) or not ai_output.strip():
        raise ValueError("The vision model returned an empty response.")

    cleaned = re.sub(r"^```(?:json)?\s*", "", ai_output.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("The vision model did not return a JSON object.")
        try:
            result = json.loads(cleaned[start:end + 1])
        except json.JSONDecodeError as error:
            raise ValueError("The vision model did not return a JSON object.") from error

    if not isinstance(result, dict):
        raise ValueError("The vision model response must be a JSON object.")
    return result


def _coerce_confidence(value) -> int:
    if type(value) is int and 0 <= value <= 100:
        return value
    if isinstance(value, float) and value.is_integer() and 0 <= value <= 100:
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        number = int(value.strip())
        if 0 <= number <= 100:
            return number
    raise ValueError("The vision model confidence must be an integer from 0 to 100.")


def _text_list(value, field_name: str) -> list[str]:
    if not isinstance(value, list) or len(value) > 20:
        raise ValueError(f"{field_name} must be a list of at most 20 strings.")
    if any(not isinstance(item, str) or not item.strip() or len(item) > 500 for item in value):
        raise ValueError(f"{field_name} contains an invalid entry.")
    return [item.strip() for item in value]


def normalize_analysis_category(value: str | None) -> str:
    raw = (value or "MOUTH").strip().upper().replace("-", "_").replace(" ", "_")
    if raw in {"ORAL", "ORAL_CAVITY", "MOUTH_ORAL"}:
        return "MOUTH"
    if raw in IMAGE_CATEGORIES:
        return raw
    raise ValueError("Choose MOUTH, TONGUE or SKIN as the screening image category.")


def _normalize_finding(item: dict, allowed_features: set[str]) -> dict:
    if not isinstance(item, dict):
        raise ValueError("Each visual finding must be an object.")
    feature = str(item.get("feature") or "").strip().upper()
    if feature not in allowed_features:
        raise ValueError("The vision model returned an unsupported visual feature.")
    scale = str(item.get("scale") if item.get("scale") is not None else "").strip().upper()
    if scale == "NA":
        scale = "N/A"
    if scale not in OBSERVATION_SCALES:
        raise ValueError("Visual finding scale must be 0, 1, 2, 3 or N/A.")
    note = item.get("note")
    if note is None or note == "":
        note_text = None
    elif isinstance(note, str) and note.strip() and len(note) <= 200:
        note_text = note.strip()
    else:
        raise ValueError("Visual finding note is invalid.")
    return {"feature": feature, "scale": scale, "note": note_text}


def _derive_classification(model_status: str, findings: list[dict]) -> str:
    if model_status == "NOT_ASSESSABLE":
        return "UNCERTAIN"
    if any(item["scale"] == "N/A" for item in findings):
        return "UNCERTAIN"
    if any(item["scale"] in {"1", "2", "3"} for item in findings):
        return "ABNORMAL"
    return "NORMAL"


def _observation_texts(findings: list[dict], model_status: str, reason: str | None) -> tuple[list[str], list[str]]:
    if model_status == "NOT_ASSESSABLE":
        text = reason or "The image is not clear enough for reliable visual observation."
        return [text], []
    observations = []
    abnormalities = []
    for item in findings:
        label = FEATURE_LABELS.get(item["feature"], item["feature"])
        scale_label = SCALE_LABELS[item["scale"]]
        line = f"{label}: {scale_label}"
        if item.get("note"):
            line = f"{line} ({item['note']})"
        observations.append(line)
        if item["scale"] in {"1", "2", "3"}:
            abnormalities.append(line)
    if not observations:
        observations = ["No listed visual features were marked as present."]
    return observations, abnormalities


def validate_ai_result(result: dict, *, view: str = "FRONT_VIEW", category: str = "MOUTH") -> dict:
    """Validate model JSON and normalize to the screening analysis contract."""
    selected_category = normalize_analysis_category(
        result.get("selected_category") or result.get("category") or category
    )
    allowed = set(CATEGORY_FEATURES[selected_category])

    # Legacy NORMAL/ABNORMAL/UNCERTAIN payloads remain accepted for compatibility.
    if "possible_visual_findings" not in result and result.get("classification") in {"NORMAL", "ABNORMAL", "UNCERTAIN"}:
        confidence = _coerce_confidence(result.get("confidence"))
        image_quality = result.get("image_quality")
        if image_quality not in IMAGE_QUALITY_VALUES:
            raise ValueError("The vision model returned an unsupported image-quality value.")
        recommendation = result.get("recommendation")
        if not isinstance(recommendation, str) or not recommendation.strip() or len(recommendation) > 500:
            raise ValueError("The vision model recommendation is invalid.")
        classification = result["classification"]
        observations = _text_list(result.get("observations"), "observations")
        abnormalities = _text_list(result.get("abnormalities"), "abnormalities")
        model_status = "NOT_ASSESSABLE" if classification == "UNCERTAIN" else "OK"
        # Legacy payloads have no structured findings — score cannot be calculated.
        visual_score = compute_visual_health_assessment_score([], model_status=model_status)
        return {
            "view": view,
            "selected_category": selected_category,
            "model_status": model_status,
            "image_quality": image_quality,
            "observation_confidence": confidence,
            "not_assessable_reason": observations[0] if model_status == "NOT_ASSESSABLE" and observations else None,
            "possible_visual_findings": [],
            "classification": classification,
            "confidence": confidence,
            "observations": observations,
            "abnormalities": abnormalities,
            "recommendation": CLINICIAN_REVIEW_RECOMMENDATION,
            **visual_score,
        }

    model_status = str(result.get("model_status") or "").strip().upper()
    if model_status not in MODEL_STATUSES:
        raise ValueError("The vision model returned an unsupported model_status.")

    image_quality = str(result.get("image_quality") or "").strip().upper()
    if image_quality not in IMAGE_QUALITY_VALUES:
        raise ValueError("The vision model returned an unsupported image-quality value.")

    raw_findings = result.get("possible_visual_findings")
    if not isinstance(raw_findings, list) or len(raw_findings) > 20:
        raise ValueError("possible_visual_findings must be a list of at most 20 items.")

    findings = [_normalize_finding(item, allowed) for item in raw_findings]
    seen = {item["feature"] for item in findings}
    if len(seen) != len(findings):
        raise ValueError("possible_visual_findings contains duplicate features.")

    # Score from model-returned findings only — never treat padded defaults as healthy.
    visual_score = compute_visual_health_assessment_score(findings, model_status=model_status)

    not_assessable_reason = result.get("not_assessable_reason")
    if model_status == "NOT_ASSESSABLE":
        if not isinstance(not_assessable_reason, str) or not not_assessable_reason.strip() or len(not_assessable_reason) > 500:
            raise ValueError("not_assessable_reason is required when the image is not assessable.")
        not_assessable_reason = not_assessable_reason.strip()
        findings = [
            {"feature": feature, "scale": "N/A", "note": None}
            for feature in CATEGORY_FEATURES[selected_category]
        ]
    else:
        not_assessable_reason = None
        # Pad omitted features as "not observed" so partial model JSON remains usable.
        for feature in CATEGORY_FEATURES[selected_category]:
            if feature not in seen:
                findings.append({"feature": feature, "scale": "0", "note": None})
        order = {feature: index for index, feature in enumerate(CATEGORY_FEATURES[selected_category])}
        findings.sort(key=lambda item: order.get(item["feature"], 999))

    confidence_raw = result.get("observation_confidence", result.get("confidence"))
    if model_status == "NOT_ASSESSABLE" and confidence_raw is None:
        confidence = 0
    else:
        confidence = _coerce_confidence(confidence_raw)

    classification = _derive_classification(model_status, findings)
    observations, abnormalities = _observation_texts(findings, model_status, not_assessable_reason)

    return {
        "view": view,
        "selected_category": selected_category,
        "model_status": model_status,
        "image_quality": image_quality,
        "observation_confidence": confidence,
        "not_assessable_reason": not_assessable_reason,
        "possible_visual_findings": findings,
        "classification": classification,
        "confidence": confidence,
        "observations": observations,
        "abnormalities": abnormalities,
        "recommendation": CLINICIAN_REVIEW_RECOMMENDATION,
        **visual_score,
    }


def build_analysis_prompt(view: str, category: str) -> str:
    selected = normalize_analysis_category(category)
    features = CATEGORY_FEATURES[selected]
    feature_lines = ", ".join(features)
    return f"""
Visible photo view: {VIEW_LABELS.get(view, view)}.
Selected screening category: {selected}.

You provide preliminary visual observations only. This is not a diagnosis and cannot
rule out disease. Do not invent findings. Do not infer disease, cause, duration, or
treatment. Do not prescribe medicine. Use only what is clearly visible in this image.
If the image is unclear, obstructed, or the category cannot be assessed, set
model_status to NOT_ASSESSABLE.

Return ONLY one JSON object. No markdown. No prose before or after the JSON.

Required JSON shape:
{{
  "selected_category": "{selected}",
  "model_status": "OK" | "NOT_ASSESSABLE",
  "image_quality": "GOOD" | "FAIR" | "POOR" | "UNKNOWN",
  "observation_confidence": 0,
  "not_assessable_reason": null,
  "possible_visual_findings": [
    {{"feature": "FEATURE_CODE", "scale": "0", "note": null}}
  ]
}}

Rules:
- observation_confidence must be a JSON integer from 0 to 100 (not a decimal or string).
- observation_confidence is how clearly THIS image supports your observations.
  Use lower values when blur, poor lighting, occlusion, or incomplete anatomy reduce certainty.
  Do not default to 100. Reserve 90–100 only when the image is sharp, well lit, and the
  category anatomy is fully visible.
- scale must be exactly one of: "0", "1", "2", "3", "N/A".
  0 = Not observed, 1 = Mild appearance, 2 = Moderate appearance,
  3 = Prominent appearance, N/A = Cannot assess.
- Scale is appearance only. It is not disease severity or disease probability.
- When model_status is OK, include exactly these features for {selected}: {feature_lines}.
- When model_status is NOT_ASSESSABLE, set not_assessable_reason to a short reason and
  you may return an empty possible_visual_findings list.
- Only mark a feature 1/2/3 when that feature is actually visible.
- Do not invent findings that are not visible.
""".strip()


class GemmaCloudVision:
    def __init__(self, client, model_name: str):
        self.client = client
        self.model_name = model_name

    def get_model_information(self) -> dict:
        return {
            "provider": "cloudflare-workers-ai",
            "model_version": self.model_name,
            "model_type": "cloud_vision",
            "trained_oral_model": False,
            "validation_status": "NOT_VALIDATED",
        }

    async def analyze(self, image_data: bytes, view: str, category: str = "MOUTH") -> dict:
        selected = normalize_analysis_category(category)
        prompt = build_analysis_prompt(view, selected)
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
        return validate_ai_result(extract_json_response(content), view=view, category=selected)
