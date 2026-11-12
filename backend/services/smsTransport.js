const MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow";
const REQUEST_TIMEOUT_MS = 10000;

function result(success, status, message) {
  return { success, status, message };
}

function normalizeIndianMobile(value) {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[\s()+-]/g, "");
  let nationalNumber = digits;
  if (digits.length === 12 && digits.startsWith("91")) {
    nationalNumber = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    nationalNumber = digits.slice(1);
  }
  return /^[6-9]\d{9}$/.test(nationalNumber) ? `91${nationalNumber}` : null;
}

async function sendSetupSms({ phone, setupUrl }) {
  if (String(process.env.SMS_PROVIDER || "").toLowerCase() !== "msg91") {
    return result(false, "NOT_CONFIGURED", "SMS delivery is not configured.");
  }
  const mobile = normalizeIndianMobile(phone);
  if (!mobile) return result(false, "FAILED", "The registered mobile number is invalid.");

  const apiKey = process.env.SMS_API_KEY;
  const templateId = process.env.SMS_TEMPLATE_ID;
  if (!apiKey || !templateId) {
    return result(false, "NOT_CONFIGURED", "SMS delivery is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(MSG91_FLOW_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        authkey: apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        template_id: templateId,
        recipients: [{ mobiles: mobile, VAR1: setupUrl }],
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || String(body.type || "").toLowerCase() !== "success") {
      return result(false, "FAILED", "SMS delivery failed. Check the MSG91 configuration and try again.");
    }
    return result(true, "SENT", "SMS sent.");
  } catch {
    return result(false, "FAILED", "SMS delivery failed. Check the MSG91 configuration and try again.");
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { sendSetupSms, normalizeIndianMobile };
