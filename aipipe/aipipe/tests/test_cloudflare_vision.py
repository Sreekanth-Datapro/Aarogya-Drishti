import base64
import json
import unittest
from unittest.mock import Mock

import httpx

from cloudflare_vision import CloudflareVisionError, CloudflareWorkersAIClient


class CloudflareVisionClientTests(unittest.TestCase):
    def test_chat_builds_multimodal_payload_and_returns_content(self):
        captured = {}

        def respond(request):
            captured["payload"] = json.loads(request.content)
            captured["path"] = request.url.path
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "result": {"response": '{"detected_category":"MOUTH","confidence":90,"reason":"ok"}'},
                },
            )

        transport = httpx.MockTransport(respond)
        http_client = httpx.Client(transport=transport)
        client = CloudflareWorkersAIClient(
            "acct",
            "token",
            "@cf/meta/llama-3.2-11b-vision-instruct",
            http_client=http_client,
        )
        response = client.chat(
            messages=[{
                "role": "user",
                "content": "Return JSON only",
                "images": [b"\xff\xd8\xff"],
            }],
            options={"temperature": 0},
        )
        self.assertIn("MOUTH", response.message.content)
        self.assertIn("/ai/run/@cf/meta/llama-3.2-11b-vision-instruct", captured["path"])
        self.assertIn("image_url", captured["payload"]["messages"][1]["content"][1])
        data_uri = captured["payload"]["messages"][1]["content"][1]["image_url"]["url"]
        self.assertEqual(base64.b64decode(data_uri.split(",", 1)[1]), b"\xff\xd8\xff")
        self.assertEqual(response.provider_trace["provider_request_started"], True)
        self.assertEqual(response.provider_trace["provider_request_success"], True)
        self.assertEqual(response.provider_trace["provider_response_received"], True)
        self.assertEqual(response.provider_trace["provider_http_status"], 200)
        http_client.close()

    def test_chat_raises_on_api_error(self):
        transport = httpx.MockTransport(lambda request: httpx.Response(
            402,
            json={"success": False, "errors": [{"message": "payment required"}]},
        ))
        http_client = httpx.Client(transport=transport)
        client = CloudflareWorkersAIClient("acct", "token", http_client=http_client)
        with self.assertRaises(CloudflareVisionError) as raised:
            client.chat(messages=[{"role": "user", "content": "hi", "images": [b"abc"]}])
        self.assertEqual(raised.exception.status_code, 402)
        self.assertEqual(raised.exception.provider_trace["error_code"], "PROVIDER_HTTP_ERROR")
        self.assertFalse(raised.exception.provider_trace["provider_request_success"])
        http_client.close()

    def test_chat_rejects_empty_response_and_records_provider_response(self):
        transport = httpx.MockTransport(lambda _request: httpx.Response(
            200,
            json={"success": True, "result": {"response": ""}},
        ))
        http_client = httpx.Client(transport=transport)
        client = CloudflareWorkersAIClient("acct", "token", http_client=http_client)
        with self.assertRaises(CloudflareVisionError) as raised:
            client.chat(messages=[{"role": "user", "content": "hi", "images": [b"abc"]}])
        self.assertEqual(raised.exception.provider_trace["error_code"], "PROVIDER_RESPONSE_EMPTY")
        self.assertTrue(raised.exception.provider_trace["provider_response_received"])
        self.assertFalse(raised.exception.provider_trace["model_output_usable"])
        http_client.close()

    def test_chat_rejects_non_json_provider_body(self):
        transport = httpx.MockTransport(lambda _request: httpx.Response(200, content=b"not-json"))
        http_client = httpx.Client(transport=transport)
        client = CloudflareWorkersAIClient("acct", "token", http_client=http_client)
        with self.assertRaises(CloudflareVisionError) as raised:
            client.chat(messages=[{"role": "user", "content": "hi", "images": [b"abc"]}])
        self.assertEqual(raised.exception.provider_trace["error_code"], "PROVIDER_RESPONSE_INVALID")
        self.assertTrue(raised.exception.provider_trace["provider_response_received"])
        http_client.close()

    def test_chat_records_provider_timeout_without_claiming_a_response(self):
        def timeout(_request):
            raise httpx.ReadTimeout("synthetic timeout")

        transport = httpx.MockTransport(timeout)
        http_client = httpx.Client(transport=transport)
        client = CloudflareWorkersAIClient("acct", "token", http_client=http_client)
        with self.assertRaises(CloudflareVisionError) as raised:
            client.chat(messages=[{"role": "user", "content": "hi", "images": [b"abc"]}])
        self.assertEqual(raised.exception.status_code, 504)
        self.assertEqual(raised.exception.provider_trace["error_code"], "PROVIDER_TIMEOUT")
        self.assertTrue(raised.exception.provider_trace["provider_request_started"])
        self.assertFalse(raised.exception.provider_trace["provider_response_received"])
        self.assertIsNone(raised.exception.provider_trace["provider_http_status"])
        http_client.close()

    def test_chat_accepts_object_response_payload(self):
        transport = httpx.MockTransport(lambda request: httpx.Response(
            200,
            json={
                "success": True,
                "result": {
                    "response": {
                        "detected_category": "UNRELATED",
                        "confidence": 95,
                        "reason": "solid color patch",
                    }
                },
            },
        ))
        http_client = httpx.Client(transport=transport)
        client = CloudflareWorkersAIClient("acct", "token", http_client=http_client)
        response = client.chat(
            messages=[{"role": "user", "content": "classify", "images": [b"abc"]}],
        )
        payload = response.message.content
        if isinstance(payload, str):
            payload = json.loads(payload)
        self.assertEqual(payload["detected_category"], "UNRELATED")
        http_client.close()


if __name__ == "__main__":
    unittest.main()
