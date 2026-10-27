import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import GoogleMapEmbed from "@/components/shared/GoogleMapEmbed";
import { useLanguage } from "@/contexts/LanguageContext";
import { mapCoordinates } from "@/lib/googleMaps";
import { formatIQD } from "@/lib/currency";
import { translateUiText } from "@/lib/uiTranslations";

interface SearchResultsMapProps { listings: any[]; dateRange?: DateRange; }
const SearchResultsMap = ({ listings, dateRange }: SearchResultsMapProps) => {
  const { language } = useLanguage();
  const t = (text: string) => translateUiText(text, language);
  const selectId = useId();
  const [selectedId, setSelectedId] = useState("");
  const courts = useMemo(() => listings.flatMap(listing => {
    const coordinates = mapCoordinates(listing.latitude, listing.longitude);
    return coordinates ? [{ ...listing, ...coordinates }] : [];
  }), [listings]);
  const selected = courts.find(court => court.id === selectedId) || courts[0];
  const search = dateRange?.from ? `?date=${format(dateRange.from, "yyyy-MM-dd")}` : "";
  return <div className="flex h-full min-h-[420px] w-full flex-col gap-3 rounded-xl border bg-background p-3 shadow-sm">
    {selected && <div>
      <label htmlFor={selectId} className="mb-1 block text-sm font-medium">{t("Select a court on the map")}</label>
      <select id={selectId} value={selected.id} onChange={event => setSelectedId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
        {courts.map(court => <option key={court.id} value={court.id}>{court.title} · {formatIQD(court.base_price)}</option>)}
      </select>
    </div>}
    <GoogleMapEmbed latitude={selected?.latitude} longitude={selected?.longitude} fallbackQuery={selected ? undefined : "Kurdistan Region Iraq"} className="min-h-[300px] flex-1" />
    {selected ? <Link to={`/listing/${selected.id}${search}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted">
      <span className="min-w-0"><span className="block truncate font-semibold">{selected.title}</span><span className="text-sm text-muted-foreground">{formatIQD(selected.base_price)} · {t("per hour")}</span></span>
      <span className="shrink-0 text-sm font-semibold text-primary">{t("View details")}</span>
    </Link> : <p className="text-sm text-muted-foreground">{t("No courts with a saved location in these results.")}</p>}
  </div>;
};
export default SearchResultsMap;
