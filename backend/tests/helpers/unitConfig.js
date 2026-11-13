module.exports = {
  lgdBaseUrl: "https://lgdirectory.gov.in/webservices/lgdws",
  lgdTimeoutMs: 30000,
  frontendUrl: "https://frontend.example.test",
  aiPipeline: {
    url: "http://127.0.0.1:8010",
    authToken: "test-internal-pipeline-auth-token-123456",
    healthTimeoutMs: 5000,
    analysisTimeoutMs: 600000,
  },
  photoStorageDir: "C:\\synthetic-aarogya-photos",
  getSetupTokenEncryptionKey: () => Buffer.alloc(32, 1),
  // Matches Buffer.alloc(32, 7) used by districtAdminWorkflowEndToEnd encrypt fixtures.
  getMfaEncryptionKey: () => Buffer.alloc(32, 7),
};
