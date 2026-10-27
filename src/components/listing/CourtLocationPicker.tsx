import { useState } from "react";
import GoogleMapEmbed from "@/components/shared/GoogleMapEmbed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { mapCoordinates, parseGoogleMapsLocation } from "@/lib/googleMaps";
import { translateUiText } from "@/lib/uiTranslations";

interface CourtLocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  onLocationChange: (latitude: number, longitude: number) => void;
}
const CourtLocationPicker = ({ latitude, longitude, onLocationChange }: CourtLocationPickerProps) => {
  const { language } = useLanguage();
  const t = (text: string) => translateUiText(text, language);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const coordinates = mapCoordinates(latitude, longitude);
  const applyLocation = () => {
    const next = parseGoogleMapsLocation(draft);
    if (!next) { setError("Paste the exact coordinates of the court entrance, for example 36.1911, 44.0092."); return; }
    onLocationChange(next.latitude, next.longitude);
    setError(""); setDraft("");
  };
  return <div className="space-y-3">
    <GoogleMapEmbed latitude={latitude} longitude={longitude} fallbackQuery="Kurdistan Region Iraq" className="h-[380px] w-full" />
    <p className="text-sm text-muted-foreground">{t("In Google Maps, press and hold the court entrance, then copy its coordinates.")}</p>
    <Label htmlFor="court-map-location">{t("Google Maps link or coordinates")}</Label>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input id="court-map-location" dir="ltr" value={draft} onChange={event => { setDraft(event.target.value); setError(""); }} placeholder="36.1911, 44.0092" aria-describedby={error ? "court-map-error" : undefined} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); applyLocation(); } }} />
      <Button type="button" variant="outline" onClick={applyLocation} disabled={!draft.trim()}>{t("Set court location")}</Button>
    </div>
    {error && <p id="court-map-error" role="alert" className="text-sm text-destructive">{t(error)}</p>}
    {coordinates && <p className="text-xs text-muted-foreground"><span>{t("Saved coordinates")}: </span><span dir="ltr">{coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}</span></p>}
  </div>;
};
export default CourtLocationPicker;
