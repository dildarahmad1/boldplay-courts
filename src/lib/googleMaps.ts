export const mapCoordinates = (latitude: unknown, longitude: unknown) => {
  if (![latitude, longitude].every(value => typeof value === "number" || (typeof value === "string" && value.trim() !== ""))) return null;
  const lat = Number(latitude), lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { latitude: lat, longitude: lng } : null;
};

/** Build Google's keyless, cross-platform map search URL for a precise pin. */
export const googleMapsSearchUrl = (latitude: number, longitude: number) => {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  const params = new URLSearchParams({
    api: "1",
    query: `${latitude},${longitude}`,
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
};

export const googleMapsEmbedUrl = (query: string, language: string, zoom = 16) => {
  const params = new URLSearchParams({ q: query, output: "embed", z: String(zoom), hl: language === "ar" ? "ar" : "en" });
  return `https://maps.google.com/maps?${params.toString()}`;
};

/** A Maps /@ URL describes the camera, so only exact pin coordinates are accepted. */
export const parseGoogleMapsLocation = (value: string) => {
  const normalized = value.trim().replace(/،/g, ",")
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776));
  const parsePair = (pair: string) => {
    const match = pair.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    return match ? mapCoordinates(match[1], match[2]) : null;
  };
  const pair = parsePair(normalized);
  if (pair) return pair;
  try {
    const url = new URL(normalized);
    if (!/(^|\.)google\.[a-z.]+$/.test(url.hostname) && url.hostname !== "maps.app.goo.gl") return null;
    const query = url.searchParams.get("query") || url.searchParams.get("q");
    if (query && parsePair(query)) return parsePair(query);
    const pin = decodeURIComponent(url.pathname).match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    return pin ? mapCoordinates(pin[1], pin[2]) : null;
  } catch {
    return null;
  }
};
