import json
import unittest
from unittest.mock import Mock

import httpx

from cloudflare_vision import CloudflareVisionError, CloudflareWorkersAIClient


class CloudflareVisionClientTests(unittest.TestCase):
    def test_chat_builds_multimodal_payload_and_returns_content(self):
        transport = httpx.MockTransport(lambda request: httpx.Response(
            200,
            json={
                "success": True,
                "result": {"response": '{"detected_category":"MOUTH","confidence":90,"reason":"ok"}'},
            },
        ))
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
