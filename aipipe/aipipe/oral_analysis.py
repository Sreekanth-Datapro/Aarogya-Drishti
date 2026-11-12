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

    return {
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
- scale must be exactly one of: "0", "1", "2", "3", "N/A".
  0 = Not observed, 1 = Mild appearance, 2 = Moderate appearance,
  3 = Prominent appearance, N/A = Cannot assess.
- Scale is appearance only. It is not disease severity or disease probability.
- When model_status is OK, include exactly these features for {selected}: {feature_lines}.
- When model_status is NOT_ASSESSABLE, set not_assessable_reason to a short reason and
  you may return an empty possible_visual_findings list.
- Only mark a feature 1/2/3 when that feature is actually visible.
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
