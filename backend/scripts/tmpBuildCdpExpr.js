const fs = require("fs");
const path = require("path");
const p = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tmp-inject-payload.json"), "utf8"));
const expr = `(() => {
  const p = ${JSON.stringify(p)};
  sessionStorage.setItem("accessToken", p.accessToken);
  sessionStorage.setItem("user", JSON.stringify(p.user));
  sessionStorage.setItem("authMode", "online");
  location.href = "/dashboard";
  return "ok";
})()`;
fs.writeFileSync(path.join(__dirname, "..", "tmp-cdp-expr.txt"), expr);
console.log("expr_ready");
