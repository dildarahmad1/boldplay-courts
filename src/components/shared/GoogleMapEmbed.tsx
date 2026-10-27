import { useLanguage } from "@/contexts/LanguageContext";
import { googleMapsEmbedUrl, googleMapsSearchUrl, mapCoordinates } from "@/lib/googleMaps";
import { translateUiText } from "@/lib/uiTranslations";
import { cn } from "@/lib/utils";

interface GoogleMapEmbedProps {
  latitude?: number | null;
  longitude?: number | null;
  fallbackQuery?: string;
  title?: string;
  className?: string;
}

export default function GoogleMapEmbed({ latitude, longitude, fallbackQuery, title = "Court location", className }: GoogleMapEmbedProps) {
  const { language } = useLanguage();
  const t = (text: string) => translateUiText(text, language);
  const coordinates = mapCoordinates(latitude, longitude);
  const query = coordinates ? `${coordinates.latitude},${coordinates.longitude}` : fallbackQuery;
  if (!query) return <div className={cn("flex min-h-60 items-center justify-center rounded-xl border bg-muted p-6 text-sm text-muted-foreground", className)}>{t("Location not set")}</div>;
  const mapUrl = coordinates ? googleMapsSearchUrl(coordinates.latitude, coordinates.longitude)!
    : `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query })}`;
  return <div className={cn("flex min-h-60 flex-col overflow-hidden rounded-xl border bg-muted", className)}>
    <iframe src={googleMapsEmbedUrl(query, language, coordinates ? 16 : 8)} title={t(title)} className="min-h-[200px] w-full flex-1 border-0" loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
    <a href={mapUrl} target="_blank" rel="noreferrer" className="bg-background px-4 py-2 text-center text-xs font-semibold text-primary underline">{t("Open in Google Maps")} ↗</a>
  </div>;
}
