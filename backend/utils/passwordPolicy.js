// Returns an error message, or null when the password is acceptable.
function checkPassword(password, { username } = {}) {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must contain at least 8 characters";
  }
  if (password.length > 128) {
    return "Password must be at most 128 characters";
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must contain letters and numbers";
  }
  if (username && password.toLowerCase().includes(String(username).toLowerCase())) {
    return "Password must not contain the username";
  }
  return null;
}

module.exports = { checkPassword };
