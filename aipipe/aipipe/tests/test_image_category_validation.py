import asyncio
import io
import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

# main.py requires Cloudflare Workers AI credentials at import time
os.environ.setdefault("CLOUDFLARE_ACCOUNT_ID", "test-account-id")
os.environ.setdefault("CLOUDFLARE_AUTH_TOKEN", "test-cloudflare-token")
os.environ.setdefault("AI_PIPELINE_AUTH_TOKEN", "test-internal-pipeline-auth-token-123456")

from image_category_validation import (
    GemmaCategoryClassifier,
    decide_validation_result,
    extract_classifier_json,
    normalize_category,
    validate_screening_image,
)


class LoopbackClient:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            scope["client"] = ("127.0.0.1", 50000)
        await self.app(scope, receive, send)


def image_bytes(size=(800, 600), checkerboard=False, color="gray"):
    image = Image.new("RGB", size, color)
    if checkerboard:
        draw = ImageDraw.Draw(image)
        square = 8
        for y in range(0, size[1], square):
            for x in range(0, size[0], square):
                fill = "white" if (x // square + y // square) % 2 else "black"
                draw.rectangle((x, y, x + square - 1, y + square - 1), fill=fill)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


class FakeClassifier:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    async def classify(self, image_data, category):
        self.calls.append({"category": category, "bytes": len(image_data)})
        return self.payload


class CategoryValidationUnitTests(unittest.TestCase):
    def test_normalize_category_aliases(self):
        self.assertEqual(normalize_category("oral"), "MOUTH")
        self.assertEqual(normalize_category("MOUTH"), "MOUTH")
        self.assertEqual(normalize_category("tongue"), "TONGUE")
        self.assertEqual(normalize_category("SKIN"), "SKIN")
        with self.assertRaises(ValueError):
            normalize_category("EYE")

    def test_correct_mouth_image(self):
        result = decide_validation_result(
            expected_category="MOUTH",
            quality={"warnings": []},
            detected_category="MOUTH",
            confidence=90,
            reason="Oral cavity visible",
        )
        self.assertEqual(result["status"], "VALID")

    def test_correct_tongue_image(self):
        result = decide_validation_result(
            expected_category="TONGUE",
            quality={"warnings": []},
            detected_category="TONGUE",
            confidence=88,
            reason="Tongue visible",
        )
        self.assertEqual(result["status"], "VALID")

    def test_correct_skin_image(self):
        result = decide_validation_result(
            expected_category="SKIN",
            quality={"warnings": []},
            detected_category="SKIN",
            confidence=91,
            reason="Skin area visible",
        )
        self.assertEqual(result["status"], "VALID")

    def test_mouth_under_skin_is_invalid_category(self):
        result = decide_validation_result(
            expected_category="SKIN",
            quality={"warnings": []},
            detected_category="MOUTH",
            confidence=85,
            reason="Looks like oral cavity",
        )
        self.assertEqual(result["status"], "INVALID_CATEGORY")
        self.assertIn("Category was not changed", result["clinical_note"])

    def test_skin_under_tongue_is_invalid_category(self):
        result = decide_validation_result(
            expected_category="TONGUE",
            quality={"warnings": []},
            detected_category="SKIN",
            confidence=80,
            reason="Looks like skin",
        )
        self.assertEqual(result["status"], "INVALID_CATEGORY")

    def test_selfie_landscape_animal_unrelated(self):
        for reason in ("selfie", "landscape", "animal"):
            with self.subTest(reason=reason):
                result = decide_validation_result(
                    expected_category="MOUTH",
                    quality={"warnings": []},
                    detected_category="UNRELATED",
                    confidence=95,
                    reason=reason,
                )
                self.assertEqual(result["status"], "INVALID_CATEGORY")

    def test_blurry_maps_to_poor_quality(self):
        result = decide_validation_result(
            expected_category="MOUTH",
            quality={"warnings": ["blur"], "status": "RECAPTURE"},
            detected_category="MOUTH",
            confidence=90,
        )
        self.assertEqual(result["status"], "POOR_QUALITY")

    def test_uncertain_classification_needs_review(self):
        result = decide_validation_result(
            expected_category="TONGUE",
            quality={"warnings": []},
            detected_category="UNCERTAIN",
            confidence=40,
            reason="Unclear framing",
        )
        self.assertEqual(result["status"], "NEEDS_REVIEW")
        self.assertTrue(result["upload_allowed"])

    def test_low_confidence_match_needs_review(self):
        result = decide_validation_result(
            expected_category="SKIN",
            quality={"warnings": []},
            detected_category="SKIN",
            confidence=40,
            reason="Possible skin",
        )
        self.assertEqual(result["status"], "NEEDS_REVIEW")
        self.assertTrue(result["upload_allowed"])

    def test_classifier_infra_failure_blocks_upload(self):
        result = decide_validation_result(
            expected_category="MOUTH",
            quality={"warnings": []},
            detected_category="UNCERTAIN",
            confidence=0,
            reason="Vision category check unavailable (model payment required).",
            force_block=True,
        )
        self.assertEqual(result["status"], "NEEDS_REVIEW")
        self.assertFalse(result["upload_allowed"])

    def test_unrelated_blocks_upload(self):
        result = decide_validation_result(
            expected_category="MOUTH",
            quality={"warnings": []},
            detected_category="UNRELATED",
            confidence=95,
            reason="Classroom photo",
        )
        self.assertEqual(result["status"], "INVALID_CATEGORY")
        self.assertFalse(result["upload_allowed"])

    def test_corrupted_and_unsupported_via_validate(self):
        corrupted = asyncio.run(
            validate_screening_image(b"not-an-image", "image/jpeg", "MOUTH")
        )
        self.assertEqual(corrupted["status"], "CORRUPTED_IMAGE")

        oversized = asyncio.run(
            validate_screening_image(b"x" * (10 * 1024 * 1024 + 1), "image/png", "MOUTH")
        )
        self.assertEqual(oversized["status"], "CORRUPTED_IMAGE")

    def test_classifier_json_extraction(self):
        payload = extract_classifier_json(
            '```json\n{"detected_category":"MOUTH","confidence":77,"reason":"ok"}\n```'
        )
        self.assertEqual(payload["detected_category"], "MOUTH")
        self.assertEqual(payload["confidence"], 77)

    def test_validate_screening_image_uses_classifier(self):
        classifier = FakeClassifier({
            "detected_category": "TONGUE",
            "confidence": 86,
            "reason": "Tongue clearly visible",
        })
        result = asyncio.run(
            validate_screening_image(
                image_bytes(checkerboard=True),
                "image/png",
                "TONGUE",
                classifier=classifier,
            )
        )
        self.assertEqual(result["status"], "VALID")
        self.assertEqual(classifier.calls[0]["category"], "TONGUE")

    def test_validate_rejects_wrong_category_from_classifier(self):
        classifier = FakeClassifier({
            "detected_category": "MOUTH",
            "confidence": 90,
            "reason": "Oral cavity",
        })
        result = asyncio.run(
            validate_screening_image(
                image_bytes(checkerboard=True),
                "image/png",
                "SKIN",
                classifier=classifier,
            )
        )
        self.assertEqual(result["status"], "INVALID_CATEGORY")
        self.assertFalse(result["upload_allowed"])

    def test_classifier_reads_chat_object_response(self):
        class Message:
            content = '{"detected_category":"MOUTH","confidence":88,"reason":"Oral cavity visible"}'

        class Response:
            message = Message()

        client = Mock()
        client.chat.return_value = Response()
        classifier = GemmaCategoryClassifier(client, "@cf/meta/llama-3.2-11b-vision-instruct")
        payload = asyncio.run(classifier.classify(b"img", "MOUTH"))
        self.assertEqual(payload["detected_category"], "MOUTH")
        self.assertEqual(payload["confidence"], 88)

    def test_classifier_exception_blocks_upload(self):
        class Broken:
            async def classify(self, image_data, category):
                error = RuntimeError("payment required")
                error.status_code = 402
                raise error

        result = asyncio.run(
            validate_screening_image(
                image_bytes(checkerboard=True),
                "image/png",
                "MOUTH",
                classifier=Broken(),
            )
        )
        self.assertEqual(result["status"], "NEEDS_REVIEW")
        self.assertFalse(result["upload_allowed"])
        self.assertIn("payment", result["reason"].lower())


class CategoryValidationEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch.dict(
            "os.environ",
            {"AI_PIPELINE_AUTH_TOKEN": "test-internal-pipeline-auth-token-123456"},
            clear=False,
        ):
            import main
        cls.main = main
        cls.authorization = {"Authorization": f"Bearer {main.AI_PIPELINE_AUTH_TOKEN}"}
        cls.client = TestClient(main.app, headers=cls.authorization)

    def test_validate_endpoint_returns_category_result(self):
        classifier = AsyncMock(return_value={
            "detected_category": "MOUTH",
            "confidence": 90,
            "reason": "Oral cavity visible",
        })
        with patch.object(self.main.category_classifier, "classify", classifier):
            response = self.client.post(
                "/api/validate-screening-image",
                files={"file": ("mouth.png", image_bytes(checkerboard=True), "image/png")},
                data={"category": "MOUTH"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["validation"]["status"], "VALID")
        self.assertIn("suitability", body["disclaimer"].lower())

    def test_validate_endpoint_requires_auth(self):
        response = TestClient(self.main.app).post(
            "/api/validate-screening-image",
            files={"file": ("mouth.png", image_bytes(checkerboard=True), "image/png")},
            data={"category": "MOUTH"},
        )
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
