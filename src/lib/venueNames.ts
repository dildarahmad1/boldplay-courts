import type { AppLanguage } from "@/contexts/LanguageContext";

export type VenueName = {
  name: string;
  names: { en: string; ar: string; ckb: string; kmr: string };
};

// Preserve proper names. Missing translations fall back to the source name.
// Kurdish source names can be shared when no dialect-specific name is recorded.
export function venueName(venue: VenueName, language: AppLanguage) {
  return venue.names[language] ||
    (language === "kmr" ? venue.names.ckb : language === "ckb" ? venue.names.kmr : "") ||
    venue.name;
}
