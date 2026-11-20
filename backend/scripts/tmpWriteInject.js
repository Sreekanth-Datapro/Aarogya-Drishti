const fs = require("fs");
const path = require("path");
const sessionPath = path.join(__dirname, "..", "tmp-qa-session.json");
const outPath = path.join(__dirname, "..", "tmp-inject-payload.json");
const s = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
fs.writeFileSync(outPath, JSON.stringify({ accessToken: s.accessToken, user: s.user }));
console.log("inject_ready", s.user.role);
