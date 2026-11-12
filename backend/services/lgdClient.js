const { z } = require("zod");
const config = require("../config/config");
const HttpError = require("../utils/httpError");

// ==========================================
// LGD CLIENT
// Talks to the Government of India Local Government Directory web services.
// Verified against the live service (Andhra Pradesh = state code 28):
//   POST /stateList
//   POST /districtList?stateCode=28
//   POST /subdistrictList?districtCode=745        (sub-district = mandal in AP)
//   POST /villageList?subDistrictCode=4848        (note the capital D)
// LGD only accepts POST. "Development blocks" (/blockList) are a separate
// hierarchy and are deliberately not used as mandals.
// ==========================================

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

// What we expect LGD to send back. Anything else is rejected, not guessed.
const codeField = z.coerce.number().int().positive();
const textField = z.string().nullable().optional();

const STATE_ROW = z.object({ stateCode: codeField, stateNameEnglish: z.string(), stateNameLocal: textField });
const DISTRICT_ROW = z.object({ districtCode: codeField, districtNameEnglish: z.string(), districtNameLocal: textField });
const SUB_DISTRICT_ROW = z.object({ subdistrictCode: codeField, subdistrictNameEnglish: z.string(), subdistrictNameLocal: textField });
const VILLAGE_ROW = z.object({ villageCode: codeField, villageNameEnglish: z.string(), villageNameLocal: textField });

// "  EAST GODAVARI   " -> "EAST GODAVARI"
function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// LGD's "local name" is often English in capitals; keep it only if it is really Telugu
function teluguName(value) {
  const name = cleanName(value);
  return /[\u0C00-\u0C7F]/.test(name) ? name : null;
}

function sourceUrl(path) {
  return `${config.lgdBaseUrl}/${path}`;
}

// POST to LGD with a timeout and one retry for network / server errors
async function callLgd(path) {
  const cached = cache.get(path);
  if (cached && cached.expires > Date.now()) return cached.data;

  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(sourceUrl(path), {
        method: "POST",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(config.lgdTimeoutMs),
      });

      const text = await response.text();

      if (!response.ok) {
        // LGD answers unknown codes with HTTP 500 and a plain-text message
        lastError = new HttpError(502, `LGD service error (HTTP ${response.status})`, "LGD_ERROR");
        if (response.status < 500) break;
        continue;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new HttpError(502, "LGD returned data that is not JSON", "LGD_BAD_RESPONSE");
      }

      if (!Array.isArray(data)) {
        throw new HttpError(502, "LGD returned an unexpected response", "LGD_BAD_RESPONSE");
      }

      cache.set(path, { data, expires: Date.now() + CACHE_MS });
      return data;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
      lastError = new HttpError(
        503,
        timedOut ? "LGD did not respond in time. Please try again." : "Could not reach the LGD service.",
        "LGD_UNAVAILABLE"
      );
    }
  }

  throw lastError;
}

// Checks every row and converts it to { lgd_code, name_en, name_te }
function parseRows(data, schema, map) {
  return data.map((row, index) => {
    const result = schema.safeParse(row);
    if (!result.success) {
      throw new HttpError(502, `LGD returned an invalid record (row ${index + 1})`, "LGD_BAD_RESPONSE");
    }
    return map(result.data);
  })
    .filter((row) => row.name_en)
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
}

async function getStates() {
  const path = "stateList";
  const rows = parseRows(await callLgd(path), STATE_ROW, (r) => ({
    lgd_code: r.stateCode,
    name_en: cleanName(r.stateNameEnglish),
    name_te: teluguName(r.stateNameLocal),
  }));
  return { rows, sourceUrl: sourceUrl(path) };
}

async function getDistricts(stateCode) {
  const path = `districtList?stateCode=${Number(stateCode)}`;
  const rows = parseRows(await callLgd(path), DISTRICT_ROW, (r) => ({
    lgd_code: r.districtCode,
    name_en: cleanName(r.districtNameEnglish),
    name_te: teluguName(r.districtNameLocal),
  }));
  return { rows, sourceUrl: sourceUrl(path) };
}

async function getSubDistricts(districtCode) {
  const path = `subdistrictList?districtCode=${Number(districtCode)}`;
  const rows = parseRows(await callLgd(path), SUB_DISTRICT_ROW, (r) => ({
    lgd_code: r.subdistrictCode,
    name_en: cleanName(r.subdistrictNameEnglish),
    name_te: teluguName(r.subdistrictNameLocal),
  }));
  return { rows, sourceUrl: sourceUrl(path) };
}

async function getVillages(subDistrictCode) {
  const path = `villageList?subDistrictCode=${Number(subDistrictCode)}`;
  const rows = parseRows(await callLgd(path), VILLAGE_ROW, (r) => ({
    lgd_code: r.villageCode,
    name_en: cleanName(r.villageNameEnglish),
    name_te: teluguName(r.villageNameLocal),
  }));
  return { rows, sourceUrl: sourceUrl(path) };
}

function clearLgdCache() {
  cache.clear();
}

module.exports = { getStates, getDistricts, getSubDistricts, getVillages, clearLgdCache, cleanName, teluguName };
