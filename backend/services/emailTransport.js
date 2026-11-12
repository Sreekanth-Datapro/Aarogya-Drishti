const nodemailer = require("nodemailer");

function failure(status, message) {
  return { success: false, status, message };
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function getSmtpSettings() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  const port = Number(SMTP_PORT);
  if (
    !SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM
    || !Number.isInteger(port) || port < 1 || port > 65535
    || !["true", "false"].includes(String(SMTP_SECURE || "").toLowerCase())
  ) {
    return null;
  }
  return {
    host: SMTP_HOST,
    port,
    secure: String(SMTP_SECURE).toLowerCase() === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    from: SMTP_FROM,
  };
}

// Sends one email. SMTP error details are never returned or logged,
// because they could contain the message content.
async function sendEmail(to, message) {
  const settings = getSmtpSettings();
  if (!settings) return failure("NOT_CONFIGURED", "Email delivery is not configured.");
  if (!to) return failure("NOT_CONFIGURED", "No email address is available.");

  try {
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      // Without implicit TLS (e.g. port 587) STARTTLS is mandatory: never send
      // login details or the SMTP password over an unencrypted connection.
      requireTLS: !settings.secure,
      auth: { user: settings.auth.user, pass: settings.auth.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    await transporter.sendMail({ from: settings.from, to, ...message });
    return { success: true, status: "SENT", message: "Email sent." };
  } catch {
    return failure("FAILED", "Email delivery failed. Check the SMTP configuration and try again.");
  }
}

async function sendSetupEmail({ user, setupUrl }) {
  const name = escapeHtml(user?.full_name);
  const escapedUrl = escapeHtml(setupUrl);
  return sendEmail(user?.email, {
    subject: "Set up your Aarogya Drishti account",
    text: `Hello ${user?.full_name || "District Admin"},\n\nUse this secure link to set up your Aarogya Drishti account:\n${setupUrl}\n\nThis link expires in 24 hours and can only be used once.`,
    html: `<p>Hello ${name || "District Admin"},</p><p>Use the secure link below to set up your Aarogya Drishti account:</p><p><a href="${escapedUrl}">Set up your account</a></p><p>This link expires in 24 hours and can only be used once.</p>`,
  });
}

// Username, temporary password and login address for a new District Admin.
// The temporary password only exists in this email; the database keeps a bcrypt hash.
async function sendTemporaryCredentialsEmail({ user, username, temporaryPassword, loginUrl }) {
  const name = user?.full_name || "staff member";
  return sendEmail(user?.email, {
    subject: "Your Aarogya Drishti login details",
    text: [
      `Hello ${name},`,
      "",
      "A staff account has been created for you in Aarogya Drishti.",
      "",
      `Login page: ${loginUrl}`,
      `Username: ${username}`,
      `Temporary password: ${temporaryPassword}`,
      "",
      "The temporary password expires in 24 hours.",
      "When you sign in you must choose a new password. Two-step verification may be required for your role.",
      "Do not share these details with anyone.",
    ].join("\n"),
    html: `<p>Hello ${escapeHtml(name)},</p>`
      + "<p>A staff account has been created for you in Aarogya Drishti.</p>"
      + `<p>Login page: <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a><br>`
      + `Username: <strong>${escapeHtml(username)}</strong><br>`
      + `Temporary password: <strong>${escapeHtml(temporaryPassword)}</strong></p>`
      + "<p>The temporary password expires in 24 hours.</p>"
      + "<p>When you sign in you must choose a new password. Two-step verification may be required for your role.</p>"
      + "<p>Do not share these details with anyone.</p>",
  });
}

module.exports = { sendSetupEmail, sendTemporaryCredentialsEmail };
