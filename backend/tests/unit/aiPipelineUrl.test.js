const {
  assertAiPipelineUrlAllowed,
  isPrivateServiceHostname,
} = require("../../utils/aiPipelineUrl");

describe("aiPipelineUrl", () => {
  test("allows HTTPS public and private hosts", () => {
    expect(assertAiPipelineUrlAllowed("https://ai.example.com").hostname).toBe("ai.example.com");
  });

  test("allows HTTP to loopback and Docker service names", () => {
    expect(assertAiPipelineUrlAllowed("http://127.0.0.1:8010").hostname).toBe("127.0.0.1");
    expect(assertAiPipelineUrlAllowed("http://aipipe:8010").hostname).toBe("aipipe");
    expect(assertAiPipelineUrlAllowed("http://ai.render.internal").hostname).toBe("ai.render.internal");
  });

  test("rejects cleartext HTTP to public hostnames", () => {
    expect(() => assertAiPipelineUrlAllowed("http://ai.example.com")).toThrow(/HTTPS|private/i);
  });

  test("detects private service hostnames", () => {
    expect(isPrivateServiceHostname("aipipe")).toBe(true);
    expect(isPrivateServiceHostname("10.0.0.5")).toBe(true);
    expect(isPrivateServiceHostname("evil.example.com")).toBe(false);
  });
});
