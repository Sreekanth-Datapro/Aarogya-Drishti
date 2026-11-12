const lgd = require("../../services/lgdClient");

// Fake responses shaped like the real LGD web service
function fakeFetch(status, body) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
}

const realFetch = global.fetch;

beforeEach(() => lgd.clearLgdCache());
afterEach(() => { global.fetch = realFetch; });

test("districts are cleaned, sorted and keep only real Telugu local names", async () => {
  global.fetch = fakeFetch(200, [
    { districtCode: 505, districtNameEnglish: "East Godavari", districtNameLocal: "EAST GODAVARI      " },
    { districtCode: 502, districtNameEnglish: " Ananthapuramu ", districtNameLocal: "అనంతపురము" },
  ]);

  const { rows, sourceUrl } = await lgd.getDistricts(28);

  expect(rows).toEqual([
    { lgd_code: 502, name_en: "Ananthapuramu", name_te: "అనంతపురము" },
    { lgd_code: 505, name_en: "East Godavari", name_te: null },
  ]);
  expect(sourceUrl).toMatch(/districtList\?stateCode=28$/);
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("districtList?stateCode=28"), expect.objectContaining({ method: "POST" }));
});

test("villages use the subDistrictCode parameter that LGD expects", async () => {
  global.fetch = fakeFetch(200, [{ villageCode: 584868, villageNameEnglish: "A.Bandaveedhi", villageNameLocal: null }]);
  await lgd.getVillages(4848);
  expect(global.fetch.mock.calls[0][0]).toMatch(/villageList\?subDistrictCode=4848$/);
});

test("an unexpected response is rejected instead of being guessed", async () => {
  global.fetch = fakeFetch(200, { message: "not a list" });
  await expect(lgd.getSubDistricts(745)).rejects.toMatchObject({ status: 502, code: "LGD_BAD_RESPONSE" });

  lgd.clearLgdCache();
  global.fetch = fakeFetch(200, [{ subdistrictCode: "abc", subdistrictNameEnglish: "X" }]);
  await expect(lgd.getSubDistricts(745)).rejects.toMatchObject({ code: "LGD_BAD_RESPONSE" });
});

test("LGD server errors are retried once and then reported", async () => {
  global.fetch = fakeFetch(500, "Entered SubDistrict Code 0 does not exist in LGD");
  await expect(lgd.getVillages(1)).rejects.toMatchObject({ status: 502, code: "LGD_ERROR" });
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test("network failures become a 503 the admin can act on", async () => {
  global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { name: "TypeError" }));
  await expect(lgd.getStates()).rejects.toMatchObject({ status: 503, code: "LGD_UNAVAILABLE" });
});
