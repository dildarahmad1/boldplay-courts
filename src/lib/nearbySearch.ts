export const hasCoordinates = (latitude: unknown, longitude: unknown): latitude is number =>
  typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90
  && typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180;

export const distanceInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
};
