import type { ListingFormData } from "@/pages/host/CreateListing";

export const initialListingForm: ListingFormData = {
    address: "",
    city: "",
    state: "",
    postal_code: "",
    country: "Iraq",
    latitude: null,
    longitude: null,
    city_id: null,
    state_region_id: null,
    country_id: null,
    title: "",
    description: "",
    guests_max: 10,
    court_type: "football",
    surface_type: "artificial_turf",
    is_indoor: false,
    square_feet: 0,
    amenities: [],
    cover_image: "",
    images: [],
    check_in_time: "14:00",
    check_out_time: "11:00",
    min_nights: 1,
    max_nights: 30,
    house_rules: "",
    cancellation_policy_id: null,
    cancellation_policy_name: "",
    cleaning_fee: null,
    base_price: 0,
    weekly_discount: 0,
    monthly_discount: 0,
    opening_time: "08:00",
    closing_time: "22:00",
    availability_rules: [],
  };

export function listingStepError(data: ListingFormData, step: number): string | null {
  if (step === 0) {
    if (!data.title.trim()) return "Enter your court name.";
    if (!data.city.trim() || !data.address.trim()) return "Add the city and an address or nearby landmark.";
    if (data.latitude === null || data.longitude === null || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude) || Math.abs(data.latitude) > 90 || Math.abs(data.longitude) > 180) return "Place the map pin at your court entrance.";
  }
  if (step === 1) {
    if (!data.cover_image) return "Add at least one clear photo of your court.";
    if (!Number.isInteger(data.guests_max) || data.guests_max < 1 || data.guests_max > 30) return "Choose the number of players, from 1 to 30.";
  }
  if (step === 2 && (!Number.isFinite(data.base_price) || data.base_price <= 0)) return "Enter a valid hourly price in IQD.";
  if (step === 2 && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.opening_time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.closing_time) || data.closing_time <= data.opening_time)) return "Closing time must be later than opening time.";
  if (step === 2 && !data.cancellation_policy_id?.trim()) return "Choose a cancellation policy before publishing.";
  return null;
}

export function restoreListingDraft(raw: string): { data: ListingFormData; step: number } {
  const draft = JSON.parse(raw);
  if (draft?.version !== 1 || !draft.data || typeof draft.data !== "object") throw new Error("Invalid draft");
  const data = { ...initialListingForm };
  const nullableNumbers = new Set(["latitude", "longitude", "cleaning_fee"]);
  const stringArrays = new Set(["amenities", "images"]);
  for (const key of Object.keys(initialListingForm) as (keyof ListingFormData)[]) {
    if (!(key in draft.data)) continue;
    const value = draft.data[key];
    const valid = key === "availability_rules"
      ? Array.isArray(value) && value.every(rule => rule && typeof rule.id === "string" && typeof rule.startDate === "string" && typeof rule.endDate === "string" && (rule.price === null || (Number.isFinite(rule.price) && rule.price >= 0)))
      : stringArrays.has(key) ? Array.isArray(value) && value.every(item => typeof item === "string")
      : initialListingForm[key] === null ? value === null || (nullableNumbers.has(key) ? typeof value === "number" && Number.isFinite(value) : typeof value === "string")
      : typeof value === typeof initialListingForm[key] && (typeof value !== "number" || Number.isFinite(value));
    if (!valid) throw new Error(`Invalid draft field: ${key}`);
    Object.assign(data, { [key]: value });
  }
  return { data, step: Number.isInteger(draft.step) ? Math.max(0, Math.min(3, draft.step)) : 0 };
}
