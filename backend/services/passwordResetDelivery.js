const config = require("../config/config");

// Captured only under NODE_ENV=test so automated tests can complete the flow.
const testOutbox = [];

async function deliverResetLink({ user, link }) {
  if (process.env.NODE_ENV === "test") {
    testOutbox.push({ userId: user.id, link });
    return;
  }

  const mode = config.passwordResetDelivery;

  if (mode === "console" && !config.isProduction) {
    console.log(
      `[DEV ONLY] Password reset link for "${user.username}" (valid ${config.passwordResetTtlMinutes} minutes): ${link}`
    );
    return;
  }

  // Email / SMS adapters plug in here once a provider is configured.
  console.warn(
    `Password reset requested for user ${user.id}, but delivery mode "${mode}" has no configured provider.`
  );
}

module.exports = { deliverResetLink, testOutbox };
