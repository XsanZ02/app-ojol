const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  module._compile(outputText, filename);
};

const { searchLocations } = require("../src/lib/geocoding.ts");
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("Photon search applies the supplied location bias and returns exact coordinates", async () => {
  let requestUrl;
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return new Response(JSON.stringify({
      features: [{
        geometry: { coordinates: [115.2164, -8.6501] },
        properties: {
          name: "Institut Bisnis dan Teknologi Indonesia (INSTIKI)",
          housenumber: "99",
          street: "Jalan Tukad Pakerisan",
          city: "Denpasar",
          state: "Bali",
          country: "Indonesia",
        },
      }],
    }), { status: 200 });
  };
  const controller = new AbortController();

  const places = await searchLocations(
    "  Instiki ",
    { lat: -8.65, lng: 115.21 },
    controller.signal
  );
  const url = new URL(requestUrl);

  assert.equal(url.origin, "https://photon.komoot.io");
  assert.equal(url.pathname, "/api/");
  assert.equal(url.searchParams.get("q"), "Instiki");
  assert.equal(url.searchParams.get("lang"), "default");
  assert.equal(url.searchParams.get("limit"), "8");
  assert.equal(url.searchParams.get("lat"), "-8.65");
  assert.equal(url.searchParams.get("lon"), "115.21");
  assert.equal(requestOptions.signal, controller.signal);
  assert.deepEqual(places, [{
    name: "Institut Bisnis dan Teknologi Indonesia (INSTIKI)",
    address: "99 Jalan Tukad Pakerisan, Denpasar, Bali, Indonesia",
    lat: -8.6501,
    lng: 115.2164,
  }]);
});

test("Photon uses changing device coordinates as bias without imposing a search radius", async () => {
  const requestUrls = [];
  globalThis.fetch = async (url) => {
    requestUrls.push(url);
    return new Response(JSON.stringify({
      features: [{
        geometry: { coordinates: [0, 0] },
        properties: { name: "Remote location", country: "Far away" },
      }],
    }), { status: 200 });
  };

  const denpasarResults = await searchLocations(
    "Universitas",
    { lat: -8.65, lng: 115.21 },
    new AbortController().signal
  );
  await searchLocations(
    "Universitas",
    { lat: -6.2, lng: 106.8 },
    new AbortController().signal
  );
  await searchLocations("Universitas jauh", null, new AbortController().signal);

  const denpasarQuery = new URL(requestUrls[0]);
  const jakartaQuery = new URL(requestUrls[1]);
  const unrestrictedQuery = new URL(requestUrls[2]);
  assert.equal(denpasarQuery.searchParams.get("lat"), "-8.65");
  assert.equal(denpasarQuery.searchParams.get("lon"), "115.21");
  assert.equal(jakartaQuery.searchParams.get("lat"), "-6.2");
  assert.equal(jakartaQuery.searchParams.get("lon"), "106.8");
  assert.equal(unrestrictedQuery.searchParams.has("lat"), false);
  assert.equal(unrestrictedQuery.searchParams.has("lon"), false);
  assert.deepEqual(denpasarResults, [{
    name: "Remote location",
    address: "Far away",
    lat: 0,
    lng: 0,
  }]);
  for (const url of requestUrls) {
    assert.equal(url.includes("radius"), false);
    assert.equal(url.includes("bbox"), false);
  }
});

test("Photon search ignores results without valid names and coordinates", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    features: [
      { geometry: { coordinates: [115.21, -8.65] }, properties: { country: "Indonesia" } },
      { geometry: { coordinates: ["115.21", -8.65] }, properties: { name: "Invalid" } },
      { geometry: { coordinates: [115.22, -8.66] }, properties: {} },
    ],
  }), { status: 200 });

  assert.deepEqual(await searchLocations("Bali", null, new AbortController().signal), [{
    name: "Indonesia",
    address: "Indonesia",
    lat: -8.65,
    lng: 115.21,
  }]);
});

test("Photon search reports provider errors and malformed responses", async () => {
  globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
  await assert.rejects(
    searchLocations("Instiki", null, new AbortController().signal),
    /Pencarian lokasi gagal/
  );

  globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), { status: 200 });
  await assert.rejects(
    searchLocations("Instiki", null, new AbortController().signal),
    /hasil yang tidak valid/
  );
});
