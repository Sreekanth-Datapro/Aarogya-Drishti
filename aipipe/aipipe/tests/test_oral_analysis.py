import asyncio
import io
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

os.environ.setdefault("CLOUDFLARE_ACCOUNT_ID", "test-account-id")
os.environ.setdefault("CLOUDFLARE_AUTH_TOKEN", "test-cloudflare-token")
os.environ.setdefault("AI_PIPELINE_AUTH_TOKEN", "test-internal-pipeline-auth-token-123456")

from oral_analysis import (
    CATEGORY_FEATURES,
    MAX_IMAGE_BYTES,
    GemmaCloudVision,
    InvalidImageError,
    VISUAL_HEALTH_SCORE_EXPLAINED,
    VISUAL_HEALTH_SCORE_UNAVAILABLE,
    _is_unexpectedly_empty_ok,
    _usable_finding_count,
    calibrate_observation_confidence,
    compute_image_quality_score,
    compute_visual_health_assessment_score,
    extract_json_response,
    inspect_image_quality,
    prepare_image,
    validate_ai_result,
)


SCREENING_REFERENCE = "22222222-2222-4222-8222-222222222222"
VALID_MODEL_RESULT = {
    "classification": "NORMAL",
    "model_status": "OK",
    "image_quality": "GOOD",
    "observation_confidence": 80,
    "selected_category": "MOUTH",
    "possible_visual_findings": [
        {"feature": feature, "scale": "0", "note": None}
        for feature in (
            "VISIBLE_REDNESS",
            "POSSIBLE_SWELLING",
            "WHITE_OR_RED_PATCHES",
            "VISIBLE_ULCERS",
            "GUM_APPEARANCE_CHANGES",
            "OTHER_VISIBLE_ABNORMALITIES",
        )
    ],
    "observations": ["Visible redness: Not observed"],
    "abnormalities": [],
    "not_assessable_reason": None,
    "provider_trace": {
        "provider_request_started": True,
        "provider_request_success": True,
        "provider_response_received": True,
        "provider_http_status": 200,
        "provider_response_validated": True,
        "model_output_usable": True,
    },
}
PROVIDER_RESPONSE_TRACE = {
    "provider_request_started": True,
    "provider_request_success": True,
    "provider_response_received": True,
    "provider_http_status": 200,
    "provider_response_validated": False,
    "model_output_usable": False,
}


def image_bytes(size=(800, 600), checkerboard=False):
    image = Image.new("RGB", size, "gray")
    if checkerboard:
        draw = ImageDraw.Draw(image)
        square = 8
        for y in range(0, size[1], square):
            for x in range(0, size[0], square):
                if (x // square + y // square) % 2:
                    draw.rectangle((x, y, x + square - 1, y + square - 1), fill="white")
                else:
                    draw.rectangle((x, y, x + square - 1, y + square - 1), fill="black")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def model_response(confidence_marker=None):
    fields = {
        "selected_category": "MOUTH",
        "model_status": "OK",
        "image_quality": "FAIR",
        "not_assessable_reason": None,
        "possible_visual_findings": [
            {"feature": feature, "scale": "0", "note": None}
            for feature in (
                "VISIBLE_REDNESS",
                "POSSIBLE_SWELLING",
                "WHITE_OR_RED_PATCHES",
                "VISIBLE_ULCERS",
                "GUM_APPEARANCE_CHANGES",
                "OTHER_VISIBLE_ABNORMALITIES",
            )
        ],
    }
    if confidence_marker is not None:
        fields["confidence"] = confidence_marker
    return json.dumps(fields)


class LoopbackClient:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            scope["client"] = ("127.0.0.1", 50000)
        await self.app(scope, receive, send)


class ImageValidationTests(unittest.TestCase):
    def test_prepare_image_checks_real_type_and_returns_clean_jpeg(self):
        prepared, image, quality = prepare_image(image_bytes(checkerboard=True), "image/png")
        self.assertEqual(Image.open(io.BytesIO(prepared)).format, "JPEG")
        self.assertEqual(image.size, (800, 600))
        self.assertEqual(quality["status"], "ACCEPTABLE")
        self.assertEqual(quality["checker_version"], "pillow-heuristics-v1")

    def test_prepare_image_rejects_mismatched_mime_type_and_oversize(self):
        with self.assertRaises(InvalidImageError):
            prepare_image(image_bytes(), "image/jpeg")
        with self.assertRaises(InvalidImageError):
            prepare_image(b"x" * (MAX_IMAGE_BYTES + 1), "image/png")

    def test_quality_checks_mark_small_dark_and_blurry_images_for_recapture(self):
        image = Image.new("RGB", (200, 200), (0, 0, 0))
        quality = inspect_image_quality(image)
        self.assertEqual(quality["status"], "RECAPTURE")
        self.assertEqual(quality["warnings"], ["dimensions", "dark", "blur"])

    def test_quality_check_marks_small_images_for_recapture(self):
        quality = inspect_image_quality(Image.new("RGB", (320, 240), (120, 120, 120)))
        self.assertIn("dimensions", quality["warnings"])
        self.assertEqual(quality["status"], "RECAPTURE")

    def test_quality_check_marks_dark_images_for_recapture(self):
        quality = inspect_image_quality(Image.new("RGB", (800, 600), (0, 0, 0)))
        self.assertIn("dark", quality["warnings"])
        self.assertEqual(quality["status"], "RECAPTURE")

    def test_quality_check_detects_blur_without_counting_image_borders(self):
        quality = inspect_image_quality(Image.new("RGB", (800, 600), (120, 120, 120)))
        self.assertEqual(quality["metrics"]["sharpness_variance"], 0)
        self.assertEqual(quality["warnings"], ["blur"])

    def test_quality_check_accepts_a_clear_valid_image(self):
        _, _, quality = prepare_image(image_bytes(checkerboard=True), "image/png")
        self.assertEqual(quality["status"], "ACCEPTABLE")
        self.assertEqual(quality["warnings"], [])

    def test_image_quality_score_differs_across_synthetic_images(self):
        _, _, clear = prepare_image(image_bytes(checkerboard=True), "image/png")
        dark = inspect_image_quality(Image.new("RGB", (800, 600), (0, 0, 0)))
        bright = inspect_image_quality(Image.new("RGB", (800, 600), (255, 255, 255)))
        blurry = inspect_image_quality(Image.new("RGB", (800, 600), (120, 120, 120)))
        tiny = inspect_image_quality(Image.new("RGB", (200, 200), (120, 120, 120)))

        clear_report = clear["score_report"]
        self.assertEqual(clear_report["status"], "SCORED")
        self.assertIsInstance(clear_report["score"], int)
        self.assertGreaterEqual(clear_report["score"], 80)

        for label, quality in (
            ("dark", dark),
            ("bright", bright),
            ("blurry", blurry),
            ("tiny", tiny),
        ):
            with self.subTest(image=label):
                report = quality["score_report"]
                self.assertEqual(report["status"], "INSUFFICIENT")
                self.assertIsNone(report["score"])
                self.assertLess(report["raw_score"], clear_report["score"])
                self.assertEqual(report["label"], "Insufficient Image Quality")
                self.assertTrue(report["criteria"])
                self.assertNotEqual(report["raw_score"], 100)

    def test_calibrated_confidence_never_exceeds_quality_or_defaults_to_100_on_failure(self):
        quality = inspect_image_quality(Image.new("RGB", (800, 600), (0, 0, 0)))
        report = quality["score_report"]
        self.assertIsNone(
            calibrate_observation_confidence(100, report, "OK", [{"scale": "0"}])
        )

        _, _, clear = prepare_image(image_bytes(checkerboard=True), "image/png")
        clear_report = clear["score_report"]
        capped = calibrate_observation_confidence(100, clear_report, "OK", [{"scale": "0"}])
        self.assertEqual(capped, clear_report["score"])
        self.assertLessEqual(capped, 100)

        self.assertEqual(
            calibrate_observation_confidence(90, clear_report, "NOT_ASSESSABLE", []),
            30,
        )

    def test_confidence_accepts_integers_and_whole_number_coercion(self):
        for confidence, expected in ((0, 0), (40, 40), (100, 100), (85.0, 85), ("85", 85)):
            with self.subTest(confidence=confidence):
                result = validate_ai_result({**json.loads(model_response()), "confidence": confidence})
                self.assertEqual(result["confidence"], expected)

        invalid_confidences = (
            ("decimal fraction", 0.85),
            ("percentage string", "85%"),
            ("missing", None),
        )
        for label, confidence in invalid_confidences:
            with self.subTest(confidence=label):
                response = json.loads(model_response(confidence))
                with self.assertRaisesRegex(ValueError, "confidence must be an integer"):
                    validate_ai_result(response)

    def test_confidence_validation_uses_realistic_mocked_cloudflare_json(self):
        client = Mock()
        model = GemmaCloudVision(client, "@cf/meta/llama-3.2-11b-vision-instruct")

        client.chat.return_value.message.content = model_response(85)
        client.chat.return_value.provider_trace = PROVIDER_RESPONSE_TRACE
        result = asyncio.run(model.analyze(b"synthetic-image", "FRONT_VIEW"))
        self.assertEqual(result["confidence"], 85)

        for label, confidence in (
            ("decimal fraction", 0.85),
            ("percentage string", "85%"),
            ("missing", None),
        ):
            with self.subTest(confidence=label):
                client.chat.return_value.message.content = model_response(confidence)
                client.chat.return_value.provider_trace = PROVIDER_RESPONSE_TRACE
                with self.assertRaisesRegex(ValueError, "provider response did not pass"):
                    asyncio.run(model.analyze(b"synthetic-image", "LEFT_VIEW"))

    def test_ai_response_validation_does_not_coerce_invalid_lists(self):
        with self.assertRaises(ValueError):
            validate_ai_result({
                **json.loads(model_response(80)),
                "possible_visual_findings": "invalid",
            })

    def test_json_response_extraction_accepts_plain_fenced_or_object(self):
        expected = {"classification": "UNCERTAIN"}
        self.assertEqual(extract_json_response('```json\n{"classification":"UNCERTAIN"}\n```'), expected)
        self.assertEqual(extract_json_response(expected), expected)
        self.assertEqual(
            extract_json_response('Here is the result:\n{"classification":"UNCERTAIN"}\nThanks.'),
            expected,
        )
        with self.assertRaises(ValueError):
            extract_json_response("No JSON here.")

    def test_structured_mouth_findings_validate_and_derive_abnormal(self):
        payload = {
            "selected_category": "MOUTH",
            "model_status": "OK",
            "image_quality": "FAIR",
            "observation_confidence": 70,
            "not_assessable_reason": None,
            "possible_visual_findings": [
                {"feature": "VISIBLE_REDNESS", "scale": "2", "note": None},
                {"feature": "POSSIBLE_SWELLING", "scale": "0", "note": None},
                {"feature": "WHITE_OR_RED_PATCHES", "scale": "0", "note": None},
                {"feature": "VISIBLE_ULCERS", "scale": "0", "note": None},
                {"feature": "GUM_APPEARANCE_CHANGES", "scale": "1", "note": "mild"},
                {"feature": "OTHER_VISIBLE_ABNORMALITIES", "scale": "0", "note": None},
            ],
        }
        result = validate_ai_result(payload, view="FRONT_VIEW", category="MOUTH")
        self.assertEqual(result["classification"], "ABNORMAL")
        self.assertEqual(result["model_status"], "OK")
        self.assertEqual(len(result["possible_visual_findings"]), 6)
        self.assertTrue(any("Visible redness" in item for item in result["observations"]))

    def test_structured_not_assessable_and_no_visible_finding(self):
        unclear = validate_ai_result({
            "selected_category": "TONGUE",
            "model_status": "NOT_ASSESSABLE",
            "image_quality": "POOR",
            "observation_confidence": 10,
            "not_assessable_reason": "Blur prevents reliable tongue assessment.",
            "possible_visual_findings": [],
        }, category="TONGUE")
        self.assertEqual(unclear["classification"], "UNCERTAIN")
        self.assertEqual(unclear["not_assessable_reason"], "Blur prevents reliable tongue assessment.")

        none_seen = validate_ai_result({
            "selected_category": "SKIN",
            "model_status": "OK",
            "image_quality": "GOOD",
            "observation_confidence": 80,
            "not_assessable_reason": None,
            "possible_visual_findings": [
                {"feature": feature, "scale": "0", "note": None}
                for feature in (
                    "REDNESS", "VISIBLE_RASH", "PIGMENTATION_CHANGES",
                    "SWELLING", "DRY_SCALY_APPEARANCE", "VISIBLE_SORES",
                    "OTHER_VISIBLE_ABNORMALITIES",
                )
            ],
        }, category="SKIN")
        self.assertEqual(none_seen["classification"], "NORMAL")
        self.assertEqual(none_seen["abnormalities"], [])

    def test_partial_structured_findings_are_rejected_instead_of_filled_as_not_observed(self):
        with self.assertRaisesRegex(ValueError, "did not assess every required visual feature"):
            validate_ai_result(
                {
                    "selected_category": "MOUTH",
                    "model_status": "OK",
                    "image_quality": "FAIR",
                    "observation_confidence": 55,
                    "not_assessable_reason": None,
                    "possible_visual_findings": [
                        {"feature": "VISIBLE_REDNESS", "scale": "1", "note": None},
                    ],
                },
                category="MOUTH",
            )

    def test_analyze_accepts_object_content_from_cloudflare_client(self):
        client = Mock()
        client.chat.return_value.message.content = {
            "selected_category": "TONGUE",
            "model_status": "OK",
            "image_quality": "GOOD",
            "observation_confidence": 72,
            "not_assessable_reason": None,
            "possible_visual_findings": [
                {"feature": "WHITE_COATING", "scale": "2", "note": None},
                {"feature": "REDNESS", "scale": "0", "note": None},
                {"feature": "VISIBLE_SORES", "scale": "0", "note": None},
                {"feature": "SURFACE_CHANGES", "scale": "0", "note": None},
                {"feature": "SWELLING", "scale": "0", "note": None},
                {"feature": "OTHER_VISIBLE_ABNORMALITIES", "scale": "0", "note": None},
            ],
        }
        client.chat.return_value.provider_trace = PROVIDER_RESPONSE_TRACE
        model = GemmaCloudVision(client, "@cf/meta/llama-3.2-11b-vision-instruct")
        result = asyncio.run(model.analyze(b"synthetic-image", "FRONT_VIEW", "TONGUE"))
        self.assertEqual(result["selected_category"], "TONGUE")
        self.assertEqual(result["classification"], "ABNORMAL")
        self.assertEqual(result["model_status"], "OK")

    def test_cloud_model_uses_the_view_and_returns_validated_json(self):
        client = Mock()
        client.chat.return_value.message.content = {
            "selected_category": "MOUTH",
            "model_status": "OK",
            "image_quality": "GOOD",
            "observation_confidence": 80,
            "not_assessable_reason": None,
            "possible_visual_findings": [
                {"feature": feature, "scale": "0", "note": None}
                for feature in (
                    "VISIBLE_REDNESS",
                    "POSSIBLE_SWELLING",
                    "WHITE_OR_RED_PATCHES",
                    "VISIBLE_ULCERS",
                    "GUM_APPEARANCE_CHANGES",
                    "OTHER_VISIBLE_ABNORMALITIES",
                )
            ],
        }
        client.chat.return_value.provider_trace = PROVIDER_RESPONSE_TRACE
        model = GemmaCloudVision(client, "gemma4:cloud")
        with self.assertLogs("oral-image-api", level="INFO") as logs:
            result = asyncio.run(model.analyze(b"image-bytes", "LEFT_VIEW"))
        self.assertEqual(result["classification"], "NORMAL")
        self.assertTrue(result["provider_trace"]["provider_response_validated"])
        self.assertIsInstance(result["provider_trace"]["inference_duration_ms"], int)
        log_output = "\n".join(logs.output)
        self.assertIn("inference_started", log_output)
        self.assertIn("inference_completed", log_output)
        self.assertIn("provider_response_validated", log_output)
        self.assertIn("provider=cloudflare-workers-ai", log_output)
        self.assertIn("model=gemma4:cloud", log_output)
        self.assertIn("inference_duration_ms=", log_output)
        self.assertNotIn("image-bytes", log_output)
        self.assertIn("left", client.chat.call_args.kwargs["messages"][0]["content"])
        info = model.get_model_information()
        self.assertEqual(info["trained_oral_model"], False)
        self.assertEqual(info["provider"], "cloudflare-workers-ai")


class ScreeningEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch.dict(
            "os.environ",
            {
                "AI_PIPELINE_AUTH_TOKEN": "test-internal-pipeline-auth-token-123456",
                "CLOUDFLARE_ACCOUNT_ID": "test-account-id",
                "CLOUDFLARE_AUTH_TOKEN": "test-cloudflare-token",
            },
            clear=False,
        ):
            import main
        cls.main = main
        cls.authorization = {"Authorization": f"Bearer {main.AI_PIPELINE_AUTH_TOKEN}"}
        # Token auth is enough for private Docker/Render networking (no loopback requirement).
        cls.client = TestClient(main.app, headers=cls.authorization)

    def setUp(self):
        self.analysis = AsyncMock(return_value=VALID_MODEL_RESULT)
        self.model_patch = patch.object(self.main.vision_model, "analyze", self.analysis)
        self.model_patch.start()

    def tearDown(self):
        self.model_patch.stop()

    def test_assistant_chat_uses_existing_cloudflare_client_and_returns_validated_reply(self):
        provider_response = SimpleNamespace(
            message=SimpleNamespace(content="Aarogya Drishti supports oral screening workflows."),
            provider_trace={
                "provider_request_started": True,
                "provider_request_success": True,
                "provider_response_received": True,
                "provider_http_status": 200,
            },
        )
        with patch.object(self.main.client, "chat", return_value=provider_response) as provider_call:
            response = self.client.post(
                "/api/assistant/chat",
                json={
                    "locale": "en",
                    "messages": [{"role": "user", "content": "What is Aarogya Drishti?"}],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["reply"], "Aarogya Drishti supports oral screening workflows.")
        self.assertTrue(payload["provider_trace"]["inference_performed"])
        self.assertTrue(payload["provider_trace"]["model_output_usable"])
        self.assertEqual(payload["model_information"]["model_version"], self.main.MODEL)
        kwargs = provider_call.call_args.kwargs
        self.assertEqual(kwargs["model"], self.main.MODEL)
        self.assertEqual(kwargs["messages"][0]["role"], "user")
        self.assertIn("Answer both Aarogya Drishti project questions", kwargs["system_prompt"])
        self.assertIn("unrelated general questions", kwargs["system_prompt"])
        self.assertIn("2–5 short, simple sentences", kwargs["system_prompt"])
        self.assertIn("Sarvam AI is used by existing backend speech routes", kwargs["system_prompt"])
        self.assertIn("time-sensitive facts", kwargs["system_prompt"])

    def test_assistant_chat_passes_telugu_general_questions_without_project_restriction(self):
        provider_response = SimpleNamespace(
            message=SimpleNamespace(content="PostgreSQL ఒక ఓపెన్-సోర్స్ రిలేషనల్ డేటాబేస్."),
            provider_trace={
                "provider_request_started": True,
                "provider_request_success": True,
                "provider_response_received": True,
                "provider_http_status": 200,
            },
        )
        with patch.object(self.main.client, "chat", return_value=provider_response) as provider_call:
            response = self.client.post(
                "/api/assistant/chat",
                json={
                    "locale": "auto",
                    "messages": [{"role": "user", "content": "PostgreSQL అంటే ఏమిటి?"}],
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertIn("PostgreSQL", response.json()["reply"])
        kwargs = provider_call.call_args.kwargs
        self.assertIn("Reply language preference: auto.", kwargs["messages"][0]["content"])
        self.assertIn("Answer both Aarogya Drishti project questions", kwargs["system_prompt"])

    def test_assistant_chat_sends_uploaded_image_and_telugu_question_to_vision_model(self):
        provider_response = SimpleNamespace(
            message=SimpleNamespace(content="చిత్రంలో ఒక నీలం రంగు ఆకారం కనిపిస్తోంది."),
            provider_trace={
                "provider_request_started": True,
                "provider_request_success": True,
                "provider_response_received": True,
                "provider_http_status": 200,
            },
        )
        messages = [{"role": "user", "content": "ఈ చిత్రంలో ఏమి ఉంది?"}]
        with patch.object(self.main.client, "chat", return_value=provider_response) as provider_call:
            response = self.client.post(
                "/api/assistant/chat",
                data={"locale": "te", "messages": json.dumps(messages)},
                files={"image": ("sample.png", image_bytes(), "image/png")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reply"], "చిత్రంలో ఒక నీలం రంగు ఆకారం కనిపిస్తోంది.")
        provider_message = provider_call.call_args.kwargs["messages"][0]
        self.assertIn("USER: ఈ చిత్రంలో ఏమి ఉంది?", provider_message["content"])
        self.assertEqual(provider_message["image_mime_type"], "image/jpeg")
        self.assertTrue(provider_message["images"][0].startswith(b"\xff\xd8"))
        with Image.open(io.BytesIO(provider_message["images"][0])) as sent_image:
            self.assertEqual(sent_image.format, "JPEG")

    def test_assistant_chat_describes_image_when_prompt_is_empty(self):
        provider_response = SimpleNamespace(
            message=SimpleNamespace(content="A small blue square."),
            provider_trace={
                "provider_request_started": True,
                "provider_request_success": True,
                "provider_response_received": True,
                "provider_http_status": 200,
            },
        )
        with patch.object(self.main.client, "chat", return_value=provider_response) as provider_call:
            response = self.client.post(
                "/api/assistant/chat",
                data={
                    "locale": "en",
                    "messages": json.dumps([{"role": "user", "content": ""}]),
                },
                files={"image": ("sample.png", image_bytes(), "image/png")},
            )

        self.assertEqual(response.status_code, 200)
        prompt = provider_call.call_args.kwargs["messages"][0]["content"]
        self.assertIn("USER: Describe this image.", prompt)

    def test_assistant_chat_rejects_invalid_image_before_provider_inference(self):
        with patch.object(self.main.client, "chat") as provider_call:
            response = self.client.post(
                "/api/assistant/chat",
                data={
                    "locale": "en",
                    "messages": json.dumps([{"role": "user", "content": "Describe this."}]),
                },
                files={"image": ("sample.png", b"not an image", "image/png")},
            )

        self.assertEqual(response.status_code, 400)
        provider_call.assert_not_called()

    def test_assistant_chat_rejects_image_over_10mb_before_provider_inference(self):
        with patch.object(self.main.client, "chat") as provider_call:
            response = self.client.post(
                "/api/assistant/chat",
                data={
                    "locale": "en",
                    "messages": json.dumps([{"role": "user", "content": "Describe this."}]),
                },
                files={"image": ("sample.png", b"x" * (10 * 1024 * 1024 + 1), "image/png")},
            )

        self.assertEqual(response.status_code, 413)
        provider_call.assert_not_called()

    def test_assistant_chat_rejects_response_without_provider_success(self):
        provider_response = SimpleNamespace(
            message=SimpleNamespace(content="unverified answer"),
            provider_trace={
                "provider_request_started": False,
                "provider_request_success": False,
                "provider_response_received": False,
            },
        )
        with patch.object(self.main.client, "chat", return_value=provider_response):
            response = self.client.post(
                "/api/assistant/chat",
                json={
                    "locale": "auto",
                    "messages": [{"role": "user", "content": "Hello"}],
                },
            )

        self.assertEqual(response.status_code, 502)
        self.assertNotIn("reply", response.json())

    def test_assistant_chat_returns_safe_failure_when_vision_model_is_unavailable(self):
        error = self.main.CloudflareVisionError(
            "provider-specific secret details",
            status_code=503,
            provider_request_started=True,
            error_code="PROVIDER_HTTP_ERROR",
        )
        with patch.object(self.main.client, "chat", side_effect=error):
            response = self.client.post(
                "/api/assistant/chat",
                data={
                    "locale": "en",
                    "messages": json.dumps([
                        {"role": "user", "content": "Describe this image."},
                    ]),
                },
                files={"image": ("sample.png", image_bytes(), "image/png")},
            )

        self.assertEqual(response.status_code, 502)
        self.assertNotIn("provider-specific secret details", response.text)
        self.assertNotIn("reply", response.json())

    def test_screening_endpoint_returns_three_views_with_reference_and_uncertainty(self):
        files = {
            field: (f"{field}.png", io.BytesIO(image_bytes(checkerboard=True)), "image/png")
            for field in ("front", "left", "right")
        }
        with self.assertLogs("oral-image-api", level="INFO") as logs:
            response = self.client.post(
                "/api/analyze-screening",
                data={"screening_reference": SCREENING_REFERENCE},
                files=files,
            )
        self.assertEqual(response.status_code, 200)
        analysis = response.json()["analysis"]
        self.assertEqual(analysis["screening_reference"], SCREENING_REFERENCE)
        self.assertEqual([item["view"] for item in analysis["views"]], ["FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"])
        self.assertEqual([item["analysis_status"] for item in analysis["views"]], ["COMPLETED"] * 3)
        self.assertEqual([item["classification"] for item in analysis["views"]], ["NORMAL"] * 3)
        self.assertTrue(all(item["model_status"] == "OK" for item in analysis["views"]))
        self.assertTrue(all(item["model_information"]["inference_performed"] for item in analysis["views"]))
        self.assertTrue(all(item["model_information"]["model_output_usable"] for item in analysis["views"]))
        log_output = "\n".join(logs.output)
        self.assertIn("request_received", log_output)
        self.assertIn("image_received", log_output)
        self.assertIn("provider_request_calling", log_output)
        self.assertIn("response_parsing_completed", log_output)
        self.assertIn("provider=cloudflare-workers-ai", log_output)
        self.assertIn(f"model={self.main.MODEL}", log_output)
        for view in ("FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"):
            self.assertIn(f"view={view}", log_output)
        self.assertNotIn(SCREENING_REFERENCE, log_output)
        self.assertNotIn("front.png", log_output)
        for item in analysis["views"]:
            for field in (
                "confidence",
                "confidence_meaning",
                "criterion_scores",
                "image_quality_score",
                "model_confidence",
                "observation_confidence",
                "overall_clinical_score",
                "score",
                "visual_health_assessment_score",
            ):
                self.assertNotIn(field, item)
            self.assertNotIn("score_report", item["image_quality"])
        self.assertEqual(analysis["review_status"], "PENDING_MEDICAL_OFFICER_REVIEW")
        self.assertEqual(self.analysis.await_count, 3)

    def screening_files(self):
        return {
            field: (f"{field}.png", io.BytesIO(image_bytes(checkerboard=True)), "image/png")
            for field in ("front", "left", "right")
        }

    def test_an_unusable_model_answer_for_one_view_is_reported_without_failing_the_screening(self):
        self.analysis.side_effect = [
            VALID_MODEL_RESULT,
            ValueError("The vision model confidence must be an integer from 0 to 100."),
            VALID_MODEL_RESULT,
        ]
        with self.assertLogs("oral-image-api", level="WARNING") as logs:
            response = self.client.post(
                "/api/analyze-screening",
                data={"screening_reference": SCREENING_REFERENCE},
                files=self.screening_files(),
            )
        self.assertEqual(response.status_code, 200)
        views = response.json()["analysis"]["views"]
        self.assertEqual([item["view"] for item in views], ["FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"])
        left = views[1]
        self.assertEqual(left["classification"], "UNCERTAIN")
        self.assertEqual(left["analysis_status"], "FAILED")
        self.assertNotIn("model_confidence", left)
        self.assertIn("MODEL_RESPONSE_INVALID", left["uncertainty_warnings"])
        self.assertFalse(left["model_information"]["model_output_usable"])
        self.assertTrue(views[2]["model_information"]["model_output_usable"])
        self.assertIn("provider_output_invalid", "\n".join(logs.output))

    def test_invalid_confidence_values_return_uncertain_views_with_mo_review_required(self):
        confidence_values = iter((0.85, "85%", None))

        async def mocked_model_response(*_args, **_kwargs):
            confidence = next(confidence_values)
            client = Mock()
            client.chat.return_value.message.content = model_response(confidence)
            return await GemmaCloudVision(client, "@cf/meta/llama-3.2-11b-vision-instruct").analyze(
                b"synthetic-image", "FRONT_VIEW"
            )

        self.analysis.side_effect = mocked_model_response
        with self.assertLogs("oral-image-api", level="WARNING"):
            response = self.client.post(
                "/api/analyze-screening",
                data={"screening_reference": SCREENING_REFERENCE, "category": "MOUTH"},
                files=self.screening_files(),
            )

        self.assertEqual(response.status_code, 200)
        views = response.json()["analysis"]["views"]
        self.assertEqual([view["classification"] for view in views], ["UNCERTAIN"] * 3)
        for view in views:
            self.assertIn("MODEL_RESPONSE_INVALID", view["uncertainty_warnings"])
            self.assertIn("CLINICIAN_REVIEW_REQUIRED", view["uncertainty_warnings"])
            self.assertEqual(view["review_status"], "PENDING_MEDICAL_OFFICER_REVIEW")
            self.assertFalse(view["model_information"]["model_output_usable"])
            self.assertEqual(view["model_status"], "INVALID_OUTPUT")

    def test_a_model_api_failure_is_isolated_to_its_image_and_logged_without_the_key(self):
        rejected = type("ResponseError", (Exception,), {})("unauthorized")
        rejected.status_code = 401
        self.analysis.side_effect = rejected
        with self.assertLogs("oral-image-api", level="ERROR") as logs:
            response = self.client.post(
                "/api/analyze-screening",
                data={"screening_reference": SCREENING_REFERENCE},
                files=self.screening_files(),
            )
        self.assertEqual(response.status_code, 200)
        views = response.json()["analysis"]["views"]
        self.assertEqual([view["analysis_status"] for view in views], ["FAILED"] * 3)
        self.assertTrue(all(view["model_status"] == "ANALYSIS_FAILED" for view in views))
        log_text = "\n".join(logs.output)
        self.assertIn("error_code=PROVIDER_REQUEST_FAILED", log_text)
        self.assertNotIn("test-cloudflare-token", log_text)

    def test_screening_endpoint_accepts_one_or_two_uploaded_images_and_keeps_each_view_and_category(self):
        for field, view in (
            ("front", "FRONT_VIEW"),
            ("left", "LEFT_VIEW"),
            ("right", "RIGHT_VIEW"),
        ):
            with self.subTest(field=field):
                self.analysis.reset_mock()

                async def category_response(_image_data, _view, category, **_kwargs):
                    result = {**VALID_MODEL_RESULT, "selected_category": category}
                    result["possible_visual_findings"] = [
                        {"feature": feature, "scale": "0", "note": None}
                        for feature in CATEGORY_FEATURES[category]
                    ]
                    return result

                self.analysis.side_effect = category_response
                response = self.client.post(
                    "/api/analyze-screening",
                    data={
                        "screening_reference": SCREENING_REFERENCE,
                        f"{field}_category": "TONGUE",
                    },
                    files={
                        field: (
                            f"{field}.png",
                            io.BytesIO(image_bytes(checkerboard=True)),
                            "image/png",
                        ),
                    },
                )

                self.assertEqual(response.status_code, 200)
                views = response.json()["analysis"]["views"]
                self.assertEqual([item["view"] for item in views], [view])
                self.assertEqual([item["selected_category"] for item in views], ["TONGUE"])
                self.assertEqual(self.analysis.await_count, 1)
                self.assertEqual(self.analysis.await_args.args[1:], (view, "TONGUE"))

        self.analysis.reset_mock()

        async def category_response(_image_data, _view, category, **_kwargs):
            result = {**VALID_MODEL_RESULT, "selected_category": category}
            result["possible_visual_findings"] = [
                {"feature": feature, "scale": "0", "note": None}
                for feature in CATEGORY_FEATURES[category]
            ]
            return result

        self.analysis.side_effect = category_response
        response = self.client.post(
            "/api/analyze-screening",
            data={
                "screening_reference": SCREENING_REFERENCE,
                "front_category": "MOUTH",
                "left_category": "TONGUE",
            },
            files={
                "front": ("front.png", io.BytesIO(image_bytes(checkerboard=True)), "image/png"),
                "left": ("left.png", io.BytesIO(image_bytes(checkerboard=True)), "image/png"),
            },
        )

        self.assertEqual(response.status_code, 200)
        views = response.json()["analysis"]["views"]
        self.assertEqual([item["view"] for item in views], ["FRONT_VIEW", "LEFT_VIEW"])
        self.assertEqual([item["selected_category"] for item in views], ["MOUTH", "TONGUE"])
        self.assertEqual(self.analysis.await_count, 2)
        self.assertEqual(self.analysis.await_args_list[0].args[1:], ("FRONT_VIEW", "MOUTH"))
        self.assertEqual(self.analysis.await_args_list[1].args[1:], ("LEFT_VIEW", "TONGUE"))

    def test_screening_endpoint_requires_at_least_one_uploaded_image(self):
        response = self.client.post(
            "/api/analyze-screening",
            data={"screening_reference": SCREENING_REFERENCE},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Upload at least one screening photo.")
        self.analysis.assert_not_awaited()

    def test_screening_endpoint_rejects_missing_bearer_token(self):
        files = {
            field: (f"{field}.png", io.BytesIO(image_bytes(checkerboard=True)), "image/png")
            for field in ("front", "left", "right")
        }
        response = TestClient(self.main.app).post(
            "/api/analyze-screening",
            data={"screening_reference": SCREENING_REFERENCE},
            files=files,
        )
        self.assertEqual(response.status_code, 403)
        self.analysis.assert_not_awaited()

    def test_screening_endpoint_rejects_wrong_bearer_token(self):
        files = {
            field: (f"{field}.png", io.BytesIO(image_bytes(checkerboard=True)), "image/png")
            for field in ("front", "left", "right")
        }
        response = TestClient(
            self.main.app,
            headers={"Authorization": "Bearer totally-wrong-pipeline-token-value-xxxxx"},
        ).post(
            "/api/analyze-screening",
            data={"screening_reference": SCREENING_REFERENCE},
            files=files,
        )
        self.assertEqual(response.status_code, 403)
        self.analysis.assert_not_awaited()

    def test_screening_endpoint_ignores_spoofed_forwarded_client_ip(self):
        """Auth must not trust X-Forwarded-For; only the shared bearer token matters."""
        files = {
            field: (f"{field}.png", io.BytesIO(image_bytes(checkerboard=True)), "image/png")
            for field in ("front", "left", "right")
        }
        # Wrong token + spoofed loopback header must still fail
        response = TestClient(self.main.app).post(
            "/api/analyze-screening",
            data={"screening_reference": SCREENING_REFERENCE},
            files=files,
            headers={
                "Authorization": "Bearer wrong-token-wrong-token-wrong-token-xx",
                "X-Forwarded-For": "127.0.0.1",
                "X-Real-IP": "127.0.0.1",
            },
        )
        self.assertEqual(response.status_code, 403)
        self.analysis.assert_not_awaited()

        # Correct token works without loopback (simulates Docker service networking)
        response = TestClient(self.main.app, headers=self.authorization).post(
            "/api/analyze-screening",
            data={"screening_reference": SCREENING_REFERENCE},
            files=files,
        )
        self.assertEqual(response.status_code, 200)

    def test_legacy_endpoint_requires_internal_authentication(self):
        response = TestClient(self.main.app).post(
            "/api/analyze-oral-image",
            data={"view": "FRONT_VIEW"},
            files={"file": ("front.png", io.BytesIO(image_bytes(checkerboard=True)), "image/png")},
        )
        self.assertEqual(response.status_code, 403)
        self.analysis.assert_not_awaited()

        response = TestClient(
            self.main.app,
            headers={"Authorization": "Bearer wrong-token-wrong-token-wrong-token-xx"},
        ).post(
            "/api/analyze-oral-image",
            data={"view": "FRONT_VIEW"},
            files={"file": ("front.png", io.BytesIO(image_bytes(checkerboard=True)), "image/png")},
        )
        self.assertEqual(response.status_code, 403)
        self.analysis.assert_not_awaited()

    def test_legacy_endpoint_keeps_its_result_shape_and_accepts_optional_view(self):
        response = self.client.post(
            "/api/analyze-oral-image",
            data={"view": "FRONT_VIEW", "screening_reference": SCREENING_REFERENCE},
            files={"file": ("front.png", io.BytesIO(image_bytes(checkerboard=True)), "image/png")},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["result"]["classification"], "NORMAL")
        self.assertEqual(payload["analysis"]["view"], "FRONT_VIEW")
        self.assertEqual(payload["analysis"]["screening_reference"], SCREENING_REFERENCE)

    def test_screening_endpoint_stops_on_a_per_image_size_limit(self):
        oversized = b"x" * (MAX_IMAGE_BYTES + 1)
        files = {
            "front": ("front.png", io.BytesIO(oversized), "image/png"),
            "left": ("left.png", io.BytesIO(image_bytes(checkerboard=True)), "image/png"),
            "right": ("right.png", io.BytesIO(image_bytes(checkerboard=True)), "image/png"),
        }
        response = self.client.post(
            "/api/analyze-screening",
            data={"screening_reference": SCREENING_REFERENCE},
            files=files,
        )
        self.assertEqual(response.status_code, 413)
        self.analysis.assert_not_awaited()

    def test_dark_images_are_not_assessed_when_quality_gate_skips_inference(self):
        dark_png = io.BytesIO()
        Image.new("RGB", (800, 600), (0, 0, 0)).save(dark_png, format="PNG")
        dark_bytes = dark_png.getvalue()
        files = {
            field: (f"{field}.png", io.BytesIO(dark_bytes), "image/png")
            for field in ("front", "left", "right")
        }
        response = self.client.post(
            "/api/analyze-screening",
            data={"screening_reference": SCREENING_REFERENCE},
            files=files,
        )
        self.assertEqual(response.status_code, 200)
        views = response.json()["analysis"]["views"]
        self.analysis.assert_not_awaited()
        for view in views:
            self.assertEqual(view["classification"], "UNCERTAIN")
            self.assertEqual(view["model_status"], "NOT_ASSESSABLE")
            self.assertEqual(view["analysis_status"], "FAILED")
            self.assertEqual(view["error_code"], "QUALITY_GATE_SKIPPED")
            self.assertFalse(view["model_information"]["inference_performed"])
            self.assertNotIn("model_confidence", view)
            self.assertNotIn("image_quality_score", view)
            self.assertNotIn("visual_health_assessment_score", view)


class FindingsUsabilityHelperTests(unittest.TestCase):
    """Step 1 helpers only — does not change validate_ai_result or scoring formula."""

    MOUTH_ZEROS = [
        {"feature": "VISIBLE_REDNESS", "scale": "0", "note": None},
        {"feature": "POSSIBLE_SWELLING", "scale": "0", "note": None},
        {"feature": "WHITE_OR_RED_PATCHES", "scale": "0", "note": None},
        {"feature": "VISIBLE_ULCERS", "scale": "0", "note": None},
        {"feature": "GUM_APPEARANCE_CHANGES", "scale": "0", "note": None},
        {"feature": "OTHER_VISIBLE_ABNORMALITIES", "scale": "0", "note": None},
    ]

    def test_empty_findings_with_ok_is_unexpected(self):
        self.assertEqual(_usable_finding_count([]), 0)
        self.assertTrue(_is_unexpectedly_empty_ok("OK", []))

    def test_missing_findings_with_ok_is_unexpected(self):
        self.assertEqual(_usable_finding_count(None), 0)
        self.assertTrue(_is_unexpectedly_empty_ok("OK", None))

    def test_only_na_findings_with_ok_is_unexpected(self):
        findings = [
            {"feature": "VISIBLE_REDNESS", "scale": "N/A", "note": "blur"},
            {"feature": "POSSIBLE_SWELLING", "scale": "N/A", "note": None},
        ]
        self.assertEqual(_usable_finding_count(findings), 0)
        self.assertTrue(_is_unexpectedly_empty_ok("OK", findings))

    def test_explicit_zero_findings_with_ok_are_usable(self):
        self.assertEqual(_usable_finding_count(self.MOUTH_ZEROS), 6)
        self.assertFalse(_is_unexpectedly_empty_ok("OK", self.MOUTH_ZEROS))

    def test_abnormal_findings_with_ok_are_usable(self):
        findings = [
            {"feature": "VISIBLE_REDNESS", "scale": "2", "note": None},
            {"feature": "POSSIBLE_SWELLING", "scale": "0", "note": None},
            {"feature": "WHITE_OR_RED_PATCHES", "scale": "1", "note": "mild"},
            {"feature": "VISIBLE_ULCERS", "scale": "3", "note": None},
            {"feature": "GUM_APPEARANCE_CHANGES", "scale": "0", "note": None},
        ]
        self.assertEqual(_usable_finding_count(findings), 5)
        self.assertFalse(_is_unexpectedly_empty_ok("OK", findings))

    def test_not_assessable_with_empty_findings_is_expected(self):
        self.assertEqual(_usable_finding_count([]), 0)
        self.assertFalse(_is_unexpectedly_empty_ok("NOT_ASSESSABLE", []))
        self.assertFalse(_is_unexpectedly_empty_ok("NOT_ASSESSABLE", None))


class VisualHealthAssessmentScoreTests(unittest.TestCase):
    def test_usable_findings_produce_deterministic_score(self):
        findings = [
            {"feature": "VISIBLE_REDNESS", "scale": "0", "note": None},
            {"feature": "POSSIBLE_SWELLING", "scale": "0", "note": None},
            {"feature": "WHITE_OR_RED_PATCHES", "scale": "0", "note": None},
            {"feature": "VISIBLE_ULCERS", "scale": "0", "note": None},
            {"feature": "GUM_APPEARANCE_CHANGES", "scale": "0", "note": None},
        ]
        report = compute_visual_health_assessment_score(findings, model_status="OK")
        self.assertEqual(report["visual_health_assessment_score"], 100)
        self.assertEqual(report["visual_health_assessment_score_message"], VISUAL_HEALTH_SCORE_EXPLAINED)
        self.assertEqual(len(report["visual_health_assessment_score_reasons"]), 5)

    def test_different_appearance_scales_produce_different_scores(self):
        mild = compute_visual_health_assessment_score(
            [{"feature": "VISIBLE_REDNESS", "scale": "1", "note": None}],
            model_status="OK",
        )
        moderate = compute_visual_health_assessment_score(
            [{"feature": "VISIBLE_REDNESS", "scale": "2", "note": None}],
            model_status="OK",
        )
        prominent = compute_visual_health_assessment_score(
            [{"feature": "VISIBLE_REDNESS", "scale": "3", "note": None}],
            model_status="OK",
        )
        self.assertEqual(mild["visual_health_assessment_score"], 67)
        self.assertEqual(moderate["visual_health_assessment_score"], 33)
        self.assertEqual(prominent["visual_health_assessment_score"], 0)
        self.assertGreater(
            mild["visual_health_assessment_score"],
            moderate["visual_health_assessment_score"],
        )
        self.assertGreater(
            moderate["visual_health_assessment_score"],
            prominent["visual_health_assessment_score"],
        )

    def test_missing_findings_return_null(self):
        report = compute_visual_health_assessment_score([], model_status="OK")
        self.assertIsNone(report["visual_health_assessment_score"])
        self.assertEqual(report["visual_health_assessment_score_message"], VISUAL_HEALTH_SCORE_UNAVAILABLE)

    def test_only_na_findings_return_score_not_available(self):
        report = compute_visual_health_assessment_score(
            [
                {"feature": "VISIBLE_REDNESS", "scale": "N/A", "note": "blur"},
                {"feature": "POSSIBLE_SWELLING", "scale": "N/A", "note": None},
            ],
            model_status="OK",
        )
        self.assertIsNone(report["visual_health_assessment_score"])
        self.assertEqual(report["visual_health_assessment_score_message"], VISUAL_HEALTH_SCORE_UNAVAILABLE)
        self.assertEqual(len(report["visual_health_assessment_unassessable"]), 2)

    def test_not_assessable_status_returns_null(self):
        report = compute_visual_health_assessment_score(
            [{"feature": "VISIBLE_REDNESS", "scale": "0", "note": None}],
            model_status="NOT_ASSESSABLE",
        )
        self.assertIsNone(report["visual_health_assessment_score"])

    def test_model_confidence_does_not_affect_score(self):
        findings = [
            {"feature": "VISIBLE_REDNESS", "scale": "1", "note": None},
            {"feature": "POSSIBLE_SWELLING", "scale": "2", "note": None},
        ]
        low = compute_visual_health_assessment_score(findings, model_status="OK")
        high = compute_visual_health_assessment_score(findings, model_status="OK")
        self.assertEqual(low["visual_health_assessment_score"], high["visual_health_assessment_score"])
        self.assertEqual(low["visual_health_assessment_score"], 50)

    def test_image_quality_does_not_affect_score(self):
        findings = [{"feature": "VISIBLE_ULCERS", "scale": "3", "note": None}]
        report = compute_visual_health_assessment_score(findings, model_status="OK")
        self.assertEqual(report["visual_health_assessment_score"], 0)
        # Function has no quality/brightness parameters — score is findings-only.
        self.assertEqual(report["visual_health_assessment_score_reasons"][0]["points"], 0)

    def test_incomplete_ai_findings_are_not_filled_as_absent(self):
        with self.assertRaisesRegex(ValueError, "did not assess every required visual feature"):
            validate_ai_result(
                {
                    "selected_category": "MOUTH",
                    "model_status": "OK",
                    "image_quality": "GOOD",
                    "observation_confidence": 100,
                    "not_assessable_reason": None,
                    "possible_visual_findings": [
                        {"feature": "VISIBLE_REDNESS", "scale": "3", "note": "clear ulceration"},
                    ],
                },
                view="FRONT_VIEW",
                category="MOUTH",
            )

    def test_legacy_narrative_output_without_structured_findings_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unsupported model_status"):
            validate_ai_result({
                "classification": "ABNORMAL",
                "confidence": 95,
                "observations": ["Color change."],
                "abnormalities": ["Color change."],
                "recommendation": "Medical Officer review required.",
                "image_quality": "FAIR",
            })


if __name__ == "__main__":
    unittest.main()
