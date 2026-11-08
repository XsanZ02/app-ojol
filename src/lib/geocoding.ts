import type { LocationPoint } from "@/types/booking";

const PHOTON_API_URL = "https://photon.komoot.io/api/";

interface PhotonFeature {
  geometry?: {
    coordinates?: unknown;
  };
  properties?: Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatAddress(properties: Record<string, unknown>, name: string): string {
  const street = [text(properties.housenumber), text(properties.street)]
    .filter((part): part is string => part !== null)
    .join(" ");
  const parts = [
    street || null,
    text(properties.locality),
    text(properties.district),
    text(properties.city),
    text(properties.county),
    text(properties.state),
    text(properties.country),
  ].filter((part): part is string => part !== null);
  const uniqueParts = parts.filter(
    (part, index) => parts.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index
  );
  return uniqueParts.length > 0 ? uniqueParts.join(", ") : name;
}

export async function searchLocations(
  query: string,
  bias: Pick<LocationPoint, "lat" | "lng"> | null,
  signal: AbortSignal
): Promise<LocationPoint[]> {
  const parameters = new URLSearchParams({
    q: query.trim(),
    limit: "8",
    lang: "default",
  });
  if (bias) {
    parameters.set("lat", String(bias.lat));
    parameters.set("lon", String(bias.lng));
  }

  const response = await fetch(`${PHOTON_API_URL}?${parameters}`, {
    headers: { Accept: "application/geo+json, application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error("Pencarian lokasi gagal. Silakan coba lagi.");
  }

  const payload: unknown = await response.json();
  if (
    !payload ||
    typeof payload !== "object" ||
    !("features" in payload) ||
    !Array.isArray(payload.features)
  ) {
    throw new Error("Penyedia pencarian mengirim hasil yang tidak valid.");
  }

  return payload.features.flatMap((candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return [];
    const feature = candidate as PhotonFeature;
    const coordinates = feature.geometry?.coordinates;
    const properties = feature.properties;
    if (
      !Array.isArray(coordinates) ||
      typeof coordinates[0] !== "number" ||
      typeof coordinates[1] !== "number" ||
      !Number.isFinite(coordinates[0]) ||
      !Number.isFinite(coordinates[1]) ||
      coordinates[0] < -180 ||
      coordinates[0] > 180 ||
      coordinates[1] < -90 ||
      coordinates[1] > 90 ||
      !properties
    ) {
      return [];
    }

    const name =
      text(properties.name) ??
      text(properties.street) ??
      text(properties.city) ??
      text(properties.country);
    if (!name) return [];

    const address = formatAddress(properties, name);
    const district = text(properties.district);
    return [{
      name,
      address,
      lat: coordinates[1],
      lng: coordinates[0],
      ...(district ? { district } : {}),
    }];
  });
}
